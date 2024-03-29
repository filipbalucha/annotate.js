(function (window, document) {
  type Tag = string;
  type ChildIndex = number;
  type Path = [Tag, ChildIndex][];
  type Color = string;

  class Annotation {
    path: Path;
    comment: string;
    highlightedString: string;
    regex: RegExp;
    encodedRegex: string;
    pos: number;
    highlightColor: Color;
    anchorOffset: number;
    id: string;

    constructor(
      anchor,
      anchorOffset: number,
      highlightedString: string,
      comment?: Annotation["comment"]
    ) {
      this.path = this.pathTo(anchor.parentElement);
      this.comment = comment;
      this.highlightedString = highlightedString;
      this.regex = this.innerHtmlReadyRegex(highlightedString);
      this.encodedRegex = encodeURIComponent(this.regex.source);
      this.pos = this.positionWithinParentElement(
        anchor,
        anchorOffset,
        this.regex
      );
      this.highlightColor = null;
      this.id = this.generateRandomId();
    }

    generateRandomId = (): Annotation["id"] => {
      // Adapted from rinogo's answer: https://stackoverflow.com/a/66332305/7427716
      const id = window.URL.createObjectURL(new Blob([])).substr(-12);
      return id;
    };

    /**
     * Computes the position of anchor within its parent element. This is
     * necessary to disambiguate the match within the anchor from matches
     * occurring earlier in its parent.
     */
    positionWithinParentElement = (
      anchor: Node,
      anchorOffset: number,
      regex: RegExp
    ): number => {
      const gRegex = new RegExp(regex, "g");
      const offset = this.preAnchorOffset(anchor) + anchorOffset;
      const beforeAnchorString = anchor.parentElement.innerHTML.substring(
        0,
        offset
      );
      const matches = beforeAnchorString.match(gRegex);
      return matches ? matches.length : 0;
    };

    /**
     * Returns a regex corresponding to the input string that can be matched against
     * innerHTML of a DOM element. Using regex is necessary because innerHTML may
     * contain line breaks and other spaces that the Selection does not capture.
     */
    innerHtmlReadyRegex = (string): RegExp => {
      // Ignore space, line feed and other Unicode spaces between the words
      const pattern = string.replace(/\s+/g, "(\\s+)");
      const regex = new RegExp(pattern);

      return regex;
    };

    /**
     * Computes the offset of the anchor node within its parent element
     * by iterating over the contents of all its left siblings.
     */
    preAnchorOffset = (anchor: Node): number => {
      let preAnchorOffset = 0;
      let leftSibling = anchor.previousSibling;
      while (leftSibling) {
        // @ts-ignore
        if (leftSibling.outerHTML) {
          // @ts-ignore
          preAnchorOffset += leftSibling.outerHTML.length;
        } else if (leftSibling.textContent) {
          preAnchorOffset += leftSibling.textContent.length;
        } else {
          console.error(
            `Annotate: unsupported node type: ${leftSibling.nodeType}`,
            leftSibling
          );
        }
        leftSibling = leftSibling.previousSibling;
      }
      return preAnchorOffset;
    };

    /**
     * Determines the path to node from the root element. The path is a
     * sequence of steps, where each step is represented by tag name
     * (this is the tag of the element which we should follow at the given
     * step) and a number (this is to determine which child with that tag
     * we should follow)
     */
    pathTo = (node: Element): Path => {
      const path = [];
      let currentEl = node;
      while (currentEl.parentElement) {
        const siblings = currentEl.parentElement.children;
        let childIdx = 0;
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling.tagName === currentEl.tagName) {
            if (sibling === currentEl) {
              break;
            }
            childIdx++;
          }
        }
        const pathStep = [currentEl.tagName.toLowerCase(), childIdx];
        path.push(pathStep);
        currentEl = currentEl.parentElement;
      }
      path.reverse();
      return path;
    };

    static fromJSON = (json: string): Annotation => {
      const annotation = JSON.parse(json);
      annotation.regex = new RegExp(
        decodeURIComponent(annotation.encodedRegex)
      );

      return annotation as Annotation;
    };

    /**
     * Returns true if the input node can be highlighted, false otherwise.
     * A node can be highlighted iff neither it nor its parent are already
     * highlighted.
     *
     */
    static canHighlight = (anchorNode: Node): boolean => {
      const highlighted = (el) =>
        el.classList.contains(AnnotationManager.CLASS_HIGHLIGHT);
      if (anchorNode.nodeType === Node.ELEMENT_NODE) {
        return !highlighted(anchorNode);
      } else if (anchorNode.parentElement) {
        return !highlighted(anchorNode.parentElement);
      } else {
        return true;
      }
    };
  }

  class AnnotationManager {
    public static readonly ATTRIBUTE_ANNOTATION_ID = "annotate-id";
    static readonly CLASS_HIGHLIGHT = "__annotate-highlight__";

    colors: Color[];
    annotations: { [key: string]: Annotation };
    tooltipManager: TooltipManager;
    navigatorManager: NavigatorManager | null;

    constructor(
      colors,
      tooltipManager: TooltipManager,
      navigatorManager: NavigatorManager | null
    ) {
      this.colors = colors;
      this.annotations = {};
      this.tooltipManager = tooltipManager;

      this.loadAnnotationsFromLocalStorage();

      this.navigatorManager = navigatorManager;
      this.updateNavigator();
    }

    updateNavigator = (): void => {
      if (this.navigatorManager) {
        const annotationElements = document.getElementsByClassName(
          AnnotationManager.CLASS_HIGHLIGHT
        );
        this.navigatorManager.update(
          annotationElements as HTMLCollectionOf<HTMLElement>,
          this.annotations,
          (element: HTMLElement, annotation: Annotation) => {
            this.tooltipManager.showTooltip(
              annotation.comment,
              element,
              (color) => this.updateAnnotationColor(annotation, color),
              (comment) => this.updateAnnotationComment(annotation, comment),
              () => this.deleteAnnotation(annotation)
            );
          }
        );
      }
    };

    loadAnnotationsFromLocalStorage = (): void => {
      for (let i = 0; i < window.localStorage.length; i++) {
        try {
          const id = window.localStorage.key(i);
          const annotation = Annotation.fromJSON(
            window.localStorage.getItem(id)
          );
          this.annotations[id] = annotation;

          const range = this.annotationRange(annotation);
          this.insertAnnotationIntoDOM(annotation, range);
        } catch (e) {
          console.error("Could not parse annotation");
          console.error(e);
        }
      }
    };

    annotationRange = (annotation: Annotation): Range => {
      // Determine where to insert annotation
      const { path } = annotation;
      const element = this.elementWithHighlight(path) as Element;
      if (!element) {
        console.error(
          "Could not find Annotation on the webpage. Annotate.js does not work on webpages whose content changes dynamically."
        );
        throw new Error("Could not find annotation's element");
      }

      // Manually create a range
      const [node, start, end] = this.whereToInsert(element, annotation);
      const _ = (node as Text).splitText(end);
      const center = (node as Text).splitText(start);
      const range = document.createRange();
      range.selectNode(center);

      return range;
    };

    addAnnotation = (annotation: Annotation, color: Color): void => {
      const { id } = annotation;

      annotation.highlightColor = color;
      this.annotations[id] = annotation;

      const selection = window.getSelection();
      const range = selection.getRangeAt(0).cloneRange();

      this.insertAnnotationIntoDOM(annotation, range);
      this.updateAnnotationInLocalStorage(annotation);
      this.updateNavigator();

      this.tooltipManager.showDeleteButton(() =>
        this.deleteAnnotation(annotation)
      );
      this.tooltipManager.updateTooltipPosition();

      selection.removeAllRanges();
      selection.addRange(range);
    };

    whereToInsert = (
      element: Element,
      annotation: Annotation
    ): [Text, number, number] | null => {
      const { regex, pos } = annotation;

      let curr: Node = element.firstChild;
      let matchPos = -1;
      while (curr) {
        let start = 0;
        let end = 0;
        let match: RegExpMatchArray | null;
        // Recursively search current node for matches
        while ((match = curr.textContent.substring(end).match(regex))) {
          // Note: Cannot use a global regex here as those do not return index in their matches
          matchPos++;
          start = end + match.index;
          end += match.index + match[0].length;

          if (matchPos === pos) {
            return [curr as Text, start, end];
          }
        }
        curr = curr.nextSibling;
      }

      return null;
    };

    elementWithHighlight = (path: Path): Element => {
      if (path.length === 0) {
        return null;
      }
      let node = document as unknown as Element;
      for (const [tag, childIdx] of path) {
        node = node.getElementsByTagName(tag)[childIdx];
      }
      return node as Element;
    };

    updateAnnotationColor = (
      annotation: Annotation,
      color: Annotation["highlightColor"]
    ): void => {
      annotation.highlightColor = color;
      this.updateAnnotationInLocalStorage(annotation);
      this.updateAnnotationColorInDOM(annotation, color);
      this.updateNavigator();
    };

    updateAnnotationComment = (
      annotation: Annotation,
      newComment: Annotation["comment"]
    ): void => {
      annotation.comment = newComment;
      this.updateAnnotationInLocalStorage(annotation);
      this.updateNavigator();
    };

    updateAnnotationInLocalStorage = (annotation: Annotation) => {
      window.localStorage.setItem(annotation.id, JSON.stringify(annotation));
    };

    startSelectionInteraction = () => {
      const selection = window.getSelection();
      const { anchorOffset, focusOffset } = selection;

      // Make sure selection goes from left to right
      const leftToRight = anchorOffset < focusOffset;
      const anchor = leftToRight ? selection.anchorNode : selection.focusNode;
      const offset = leftToRight ? anchorOffset : focusOffset;

      const annotation = new Annotation(anchor, offset, selection.toString());

      this.tooltipManager.showTooltip(
        annotation.comment,
        selection.getRangeAt(0),
        (color) => this.addAnnotation(annotation, color),
        (comment) => this.updateAnnotationComment(annotation, comment)
      );
    };

    deleteAnnotation = (annotation: Annotation): void => {
      delete this.annotations[annotation.id];
      window.localStorage.removeItem(annotation.id);
      this.removeAnnotationFromDOM(annotation);
      this.tooltipManager.hideTooltip();
    };

    // Functions that manipulate the DOM:
    updateAnnotationColorInDOM = (annotation: Annotation, color: Color) => {
      const annotationElement = this.findAnnotationInDOM(annotation);
      annotationElement.style.backgroundColor = color;
    };

    findAnnotationInDOM = (annotation: Annotation): HTMLElement | null => {
      const highlights = document.getElementsByClassName(
        AnnotationManager.CLASS_HIGHLIGHT
      );
      for (let i = 0; i < highlights.length; i++) {
        const highlight = highlights[i] as HTMLElement;
        if (
          highlight.getAttribute(AnnotationManager.ATTRIBUTE_ANNOTATION_ID) ===
          annotation.id
        ) {
          return highlight;
        }
      }
      return null;
    };

    removeAnnotationFromDOM = (annotation: Annotation): void => {
      // Note: code adapted from kennebec's answer: https://stackoverflow.com/a/1614909/7427716
      const annotationNode = this.findAnnotationInDOM(annotation);
      const parentNode = annotationNode.parentNode;
      // Move all children of the annotation element under its parent
      while (annotationNode.firstChild) {
        parentNode.insertBefore(annotationNode.firstChild, annotationNode);
      }
      parentNode.removeChild(annotationNode);

      // Join sibling text nodes
      parentNode.normalize();
    };

    insertAnnotationIntoDOM = (annotation: Annotation, range: Range) => {
      const { id, highlightColor } = annotation;

      // Note: code adapted from Abhay Padda's answer: https://stackoverflow.com/a/53909619/7427716
      const span = document.createElement("span");
      span.className = AnnotationManager.CLASS_HIGHLIGHT;
      span.setAttribute(AnnotationManager.ATTRIBUTE_ANNOTATION_ID, id);
      span.style.backgroundColor = highlightColor;

      span.onclick = () => {
        this.tooltipManager.showTooltip(
          annotation.comment,
          span,
          (color) => this.updateAnnotationColor(annotation, color),
          (comment) => this.updateAnnotationComment(annotation, comment),
          () => this.deleteAnnotation(annotation)
        );
      };

      range.surroundContents(span);
    };
  }

  class TooltipManager {
    private static readonly ID_TOOLTIP = "__annotate-tooltip__";
    private static readonly ID_COMMENT = "__annotate-comment__";
    private static readonly ID_DELETE_BUTTON = "__annotate-tooltip-delete__";
    private static readonly ID_COLOR_PICKER = "__annotate-color-picker__";
    private static readonly COLOR_ATTRIBUTE = "annotate-color";
    private static readonly CLASS_COLOR_BUTTON = "__annotate-color__";
    private static readonly CLASS_COLOR_ROW = "__annotate-color-row__";
    private static readonly FALLBACK_COLOR: Color = "yellow";
    private static readonly FALLBACK_COLOR_IDX = 0;

    colors: Color[];
    tooltip: HTMLElement;
    anchorPosition: { x: number; y: number; lineHeight: number };

    constructor(colors) {
      this.colors = colors;
      this.insertTooltipIntoDOM();
    }

    wasClicked = (target: Element): boolean => {
      return this.tooltip.contains(target);
    };

    addDeleteButton = (): void => {
      const deleteButton = document.createElement("button");
      const side = "1rem";
      deleteButton.innerHTML = `<svg fill="gray" xmlns="http://www.w3.org/2000/svg" width=${side} height=${side} viewBox="0 0 24 24"><path d="M 10 2 L 9 3 L 3 3 L 3 5 L 4.109375 5 L 5.8925781 20.255859 L 5.8925781 20.263672 C 6.023602 21.250335 6.8803207 22 7.875 22 L 16.123047 22 C 17.117726 22 17.974445 21.250322 18.105469 20.263672 L 18.107422 20.255859 L 19.890625 5 L 21 5 L 21 3 L 15 3 L 14 2 L 10 2 z M 6.125 5 L 17.875 5 L 16.123047 20 L 7.875 20 L 6.125 5 z"/></svg>`;
      deleteButton.id = TooltipManager.ID_DELETE_BUTTON;

      this.tooltip.appendChild(deleteButton);
    };

    // DOM manipulation:
    insertTooltipIntoDOM = (): void => {
      this.tooltip = document.createElement("div");
      this.tooltip.id = TooltipManager.ID_TOOLTIP;
      this.addDeleteButton();
      this.addCommentArea();
      this.addColorButtons();
      document.body.appendChild(this.tooltip);
    };

    addColorButtons = (): void => {
      const buttons = document.createElement("div");
      buttons.className = TooltipManager.CLASS_COLOR_ROW;
      for (let i = 0; i < this.colors.length; i++) {
        const color = this.colors[i];
        const colorButton = document.createElement("button");
        colorButton.className = TooltipManager.CLASS_COLOR_BUTTON;
        colorButton.setAttribute(TooltipManager.COLOR_ATTRIBUTE, "" + i);
        colorButton.style.backgroundColor = color;
        buttons.appendChild(colorButton);
      }

      const verticalDivider = document.createElement("div");
      verticalDivider.className = "__annotate-vertical-divider__";
      buttons.appendChild(verticalDivider);

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.id = TooltipManager.ID_COLOR_PICKER;
      buttons.appendChild(colorInput);
      this.tooltip.appendChild(buttons);
    };

    addCommentArea = (): void => {
      const commentArea = document.createElement("textarea");
      commentArea.id = TooltipManager.ID_COMMENT;
      commentArea.placeholder = "Type a comment...";
      this.tooltip.appendChild(commentArea);
    };

    updateTooltipPosition = () => {
      const { x, y, lineHeight } = this.anchorPosition;
      // Prevent vertical overflow
      let offsetTop;
      const tooltipHeight = this.tooltip.offsetHeight;
      const scrollTop = document.scrollingElement.scrollTop;
      const isAboveViewport = y - scrollTop - tooltipHeight < 0;
      if (isAboveViewport) {
        offsetTop = y + lineHeight;
      } else {
        offsetTop = y - tooltipHeight;
      }

      // Prevent horizontal overflow
      let offsetLeft;
      const viewportWidth = window.visualViewport.width;
      const tooltipWidth = this.tooltip.offsetWidth;
      const scrollLeft = document.scrollingElement.scrollLeft;
      const isBeyondViewport = x - scrollLeft + tooltipWidth > viewportWidth;
      if (isBeyondViewport) {
        offsetLeft = scrollLeft + viewportWidth - tooltipWidth;
      } else {
        offsetLeft = x;
      }

      this.tooltip.style.transform = `translate(${offsetLeft}px, ${offsetTop}px`;
    };

    hideTooltip = () => {
      this.tooltip.style.visibility = "hidden";
    };

    showDeleteButton = (callback: () => void): void => {
      const deleteButton = document.getElementById(
        TooltipManager.ID_DELETE_BUTTON
      );
      deleteButton.style.display = "";
      deleteButton.onclick = callback;
    };

    hideDeleteButton = (): void => {
      const deleteButton = document.getElementById(
        TooltipManager.ID_DELETE_BUTTON
      );
      deleteButton.style.display = "none";
    };

    computeAnchorPosition = (anchor: HTMLElement | Range) => {
      const { scrollLeft, scrollTop } = document.scrollingElement;
      const { x, y, height } = anchor.getBoundingClientRect();
      this.anchorPosition = {
        x: x + scrollLeft,
        y: y + scrollTop,
        lineHeight: height,
      };
    };

    showTooltip = (
      comment: Annotation["comment"],
      anchor: HTMLElement | Range,
      selectColorCallback: (string) => void,
      updateCommentCallback: (string) => void,
      deleteAnnotationCallback?: () => void
    ) => {
      if (deleteAnnotationCallback) {
        this.showDeleteButton(deleteAnnotationCallback);
      } else {
        this.hideDeleteButton();
      }

      this.computeAnchorPosition(anchor);

      this.updateTooltipPosition();
      this.tooltip.style.visibility = "visible";

      // Add comment to comment area
      const commentArea = document.getElementById(
        TooltipManager.ID_COMMENT
      ) as HTMLInputElement;
      commentArea.value = comment || "";
      commentArea.onchange = (e: Event) => {
        updateCommentCallback((e.target as HTMLInputElement).value);
      };

      // Bind actions to tooltip color buttons
      const colorButtons = this.tooltip.getElementsByClassName(
        TooltipManager.CLASS_COLOR_BUTTON
      );
      for (let i = 0; i < colorButtons.length; i++) {
        const button = colorButtons[i] as HTMLElement;
        button.onclick = () => {
          const idx = parseInt(
            button.getAttribute(TooltipManager.COLOR_ATTRIBUTE)
          );
          const newColor =
            this.colors[idx] ||
            this.colors[TooltipManager.FALLBACK_COLOR_IDX] ||
            TooltipManager.FALLBACK_COLOR;
          selectColorCallback(newColor);
        };
      }

      // Bind actions to color picker
      const colorPicker = document.getElementById(
        TooltipManager.ID_COLOR_PICKER
      ) as HTMLInputElement;
      colorPicker.onchange = (e: Event) => {
        const newColor = (e.target as HTMLInputElement).value;
        selectColorCallback(newColor);
      };
    };
  }

  class NavigatorManager {
    private static readonly ID_NAVIGATOR = "__annotate-navigator__";
    private static readonly ID_TOGGLE = "__annotate-toggle__";
    private static readonly ID_CLOSE_BUTTON = "__annotate-navigator-close__";
    private static readonly CLASS_NAVIGATOR_CARD =
      "__annotate-navigator__card__";
    private static readonly CLASS_NAVIGATOR_CARDS =
      "__annotate-navigator__cards__";
    private static readonly CLASS_FILTER_ROW = "__annotate-filter__";
    private static readonly CLASS_FILTER_BUTTON = "__annotate-filter-color__";

    colors: Color[];
    navigator: HTMLElement;
    toggle: HTMLElement;
    filterColor: Annotation["highlightColor"];

    constructor(colors: Color[]) {
      const { navigator, toggle } = this.insertToggleNavigatorIntoDOM();
      this.colors = colors;
      this.navigator = navigator;
      this.toggle = toggle;
    }

    // Methods that manipulate the DOM:
    update = (
      sortedAnnotations: HTMLCollectionOf<HTMLElement>,
      annotationDetails: AnnotationManager["annotations"],
      annotationCardClickedCallback: (
        element: HTMLElement,
        annotation: Annotation
      ) => void
    ): void => {
      const prevScrollTop = this.scrollTop();

      this.navigator.replaceChildren();

      const closeButton = document.createElement("button");
      const side = "1rem";
      closeButton.innerHTML = `<svg fill="gray" xmlns="http://www.w3.org/2000/svg" width=${side} height=${side} viewBox="0 0 24 24"><path d="M 4.7070312 3.2929688 L 3.2929688 4.7070312 L 10.585938 12 L 3.2929688 19.292969 L 4.7070312 20.707031 L 12 13.414062 L 19.292969 20.707031 L 20.707031 19.292969 L 13.414062 12 L 20.707031 4.7070312 L 19.292969 3.2929688 L 12 10.585938 L 4.7070312 3.2929688 z"/></svg>`;
      closeButton.id = NavigatorManager.ID_CLOSE_BUTTON;
      closeButton.onclick = this.collapseNavigator;

      this.navigator.appendChild(closeButton);

      const filter = this.colorFilter(
        sortedAnnotations,
        annotationDetails,
        annotationCardClickedCallback
      );
      this.navigator.appendChild(filter);

      const cards = this.annotationCards(
        sortedAnnotations,
        annotationDetails,
        annotationCardClickedCallback
      );
      this.navigator.appendChild(cards);

      cards.scrollTop = prevScrollTop;
    };

    collapseNavigator = (): void => {
      this.navigator.style.visibility = "hidden";
      this.toggle.style.visibility = "visible";
    };

    colorFilter = (
      sortedAnnotations: HTMLCollectionOf<HTMLElement>,
      annotationDetails: AnnotationManager["annotations"],
      annotationCardClickedCallback: (
        element: HTMLElement,
        annotation: Annotation
      ) => void
    ): HTMLDivElement => {
      const colorFilter = document.createElement("div");
      colorFilter.className = NavigatorManager.CLASS_FILTER_ROW;
      const uniqueColors = new Set<Annotation["highlightColor"]>();
      for (const id in annotationDetails) {
        const annotation = annotationDetails[id];
        uniqueColors.add(annotation.highlightColor);
      }
      const sortedColors = [
        ...this.colors.filter((color) => uniqueColors.has(color)),
        ...Array.from(uniqueColors)
          .filter((color) => !this.colors.includes(color))
          .sort(),
      ];

      sortedColors.forEach((color) => {
        const colorButton = document.createElement("button");
        colorButton.className = NavigatorManager.CLASS_FILTER_BUTTON;
        colorButton.style.backgroundColor = color;
        if (this.filterColor === color) {
          colorButton.style.border = "2px solid gray";
        }
        colorButton.onclick = () => {
          if (this.filterColor === color) {
            this.filterColor = null;
          } else {
            this.filterColor = color;
          }
          this.update(
            sortedAnnotations,
            annotationDetails,
            annotationCardClickedCallback
          );
        };
        colorFilter.appendChild(colorButton);
      });
      return colorFilter;
    };

    annotationCards = (
      sortedAnnotations: HTMLCollectionOf<HTMLElement>,
      annotationDetails: AnnotationManager["annotations"],
      annotationCardClickedCallback: (
        element: HTMLElement,
        annotation: Annotation
      ) => void
    ): HTMLDivElement => {
      const cards = document.createElement("div");
      cards.id = NavigatorManager.CLASS_NAVIGATOR_CARDS;
      cards.style.overflow = "auto";

      for (let i = 0; i < sortedAnnotations.length; i++) {
        const annotationElement = sortedAnnotations[i];
        const id = annotationElement.getAttribute(
          AnnotationManager.ATTRIBUTE_ANNOTATION_ID
        );
        const annotation = annotationDetails[id];

        if (
          this.filterColor &&
          annotation.highlightColor !== this.filterColor
        ) {
          continue;
        }

        const { comment, highlightColor } = annotation;
        const card = document.createElement("div");
        card.style.backgroundColor = highlightColor;
        card.className = NavigatorManager.CLASS_NAVIGATOR_CARD;
        if (comment) {
          card.innerText = comment;
        } else {
          card.style.fontStyle = "italic";
          card.innerText = `"${annotation.highlightedString}"`;
        }

        card.onclick = () => {
          annotationElement.scrollIntoView({ block: "center" });
          annotationCardClickedCallback(annotationElement, annotation);
        };
        cards.appendChild(card);
      }
      return cards;
    };

    scrollTop = (): number => {
      const prevCards = document.getElementById(
        NavigatorManager.CLASS_NAVIGATOR_CARDS
      );
      return prevCards ? prevCards.scrollTop : 0;
    };

    insertToggleNavigatorIntoDOM = (): {
      navigator: HTMLElement;
      toggle: HTMLElement;
    } => {
      const navigator = document.createElement("div");
      navigator.id = NavigatorManager.ID_NAVIGATOR;

      const toggle = document.createElement("div");
      toggle.id = NavigatorManager.ID_TOGGLE;
      toggle.textContent = "a";
      toggle.onclick = () => {
        navigator.style.visibility = "visible";
        toggle.style.visibility = "hidden";
      };

      document.body.appendChild(navigator);
      document.body.appendChild(toggle);

      return { navigator, toggle };
    };

    wasClicked = (target: Element): boolean => {
      return this.toggle.contains(target) || this.navigator.contains(target);
    };
  }

  class Annotate {
    annotationManager: AnnotationManager;
    tooltipManager: TooltipManager;
    navigatorManager: NavigatorManager;

    constructor(colors: Color[], showNavigator: boolean) {
      this.navigatorManager = showNavigator
        ? new NavigatorManager(colors)
        : null;
      this.tooltipManager = new TooltipManager(colors);
      this.annotationManager = new AnnotationManager(
        colors,
        this.tooltipManager,
        this.navigatorManager
      );
      document.addEventListener("mouseup", this.handleMouseUp);
    }

    handleMouseUp = (event: MouseEvent): void => {
      const selection = window.getSelection();
      const { anchorNode, focusNode } = selection;

      const target = event.target as Element;
      const clickedNavigator = this.navigatorManager?.wasClicked(target);
      if (clickedNavigator) {
        return;
      }

      const clickedTooltip = this.tooltipManager.wasClicked(target);
      if (!clickedTooltip) {
        this.tooltipManager.hideTooltip();
      }

      const shouldStartSelectionInteraction =
        selection.toString().length &&
        anchorNode.isSameNode(focusNode) &&
        Annotation.canHighlight(anchorNode) &&
        !clickedTooltip;

      if (shouldStartSelectionInteraction) {
        this.annotationManager.startSelectionInteraction();
      }
    };
  }

  // Make Annotate globally accessible
  window["Annotate"] = window["Annotate"] || Annotate;
})(window, window.document);

// future considerations:
// - look into ways we could stop working with regex as it causes some issues when mixed with special characters
// - improve API
// -> callbacks for storing, updating and removing annotations
// -> possibly emit custom events
// -> take a list of what tags, class names, IDs can / cannot be selected
// - improve UX:
//    -> freeze selection, make it stay as long as tooltip is open?
//    -> animations
//    -> make sure the tooltip appears at the start of the selection -> get the smaller x coordinate of mouseup vs. mousedown
// - improve working with localStorage
// -> store a list of annotation IDs to look for rather than trying to parse all entries
// - cleaner files
// -> move CSS to TS
// -> separate files
// -> compile into a single js file in a separate directory
// - extend API - add callbacks? annotation created, changed, ...
// - selection across nodes
//    -> would need a regex that can match words across nodes (probably - depends on the string returned by selection in case the selection is multi-node)
//    -> another problem: span layering -> how to handle what was clicked? What if a highlight is immersed in a large highlight? we'd need to make sure its event listener gets fired
