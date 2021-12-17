(function (window, document) {
  // Global constants
  const FALLBACK_COLOR_IDX = 0;
  const FALLBACK_COLOR: Color = "yellow";
  const COLOR_ATTRIBUTE = "annotate-color";
  const CLASS_HIGHLIGHT = "__annotate-highlight__";
  const ID_TOOLTIP = "__annotate-tooltip__";
  const CLASS_COLOR_BUTTON = "__annotate-color__";
  const ID_NAVIGATOR = "__annotate-navigator__";
  const ID_TOGGLE = "__annotate-toggle__";

  // Data

  type Tag = string;
  type ChildIndex = number;
  type Path = [Tag, ChildIndex][];
  type Color = string;

  class Annotation {
    path: Path;
    comment: string;
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
     * Returns the position of anchor within its parent element.
     *
     * This is necessary to disambiguate the match within the anchor from matches
     * occurring earlier in its parent.
     *
     * @param {Node} anchor
     * @param {number} anchorOffset
     * @param {RegExp} regex
     * @returns {number}
     * @memberof Annotation
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
     * innerHTML of a DOM element.
     *
     * Using regex is necessary because innerHTML may contain line breaks and other
     * spaces that the Selection does not capture.
     *
     * @param {string} string
     * @returns {RegExp}
     * @memberof Annotation
     */
    innerHtmlReadyRegex = (string) => {
      // This pattern will ignore space, line feed and other Unicode spaces between the words
      const pattern = string.replace(/\s+/g, "(\\s+)");
      const regex = new RegExp(pattern);

      return regex;
    };

    /**
     * Computes the offset of the anchor node within its parent element
     * by iterating over the contents of all its left siblings.
     *
     * @param {Node} anchor
     *
     * @returns {number}
     * @memberof Annotation
     */
    preAnchorOffset = (anchor) => {
      let preAnchorOffset = 0;
      let leftSibling = anchor.previousSibling;
      while (leftSibling) {
        if (leftSibling.outerHTML) {
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
     *
     * @param  {Node} node
     * @returns {[[string, number]]}
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
     * @static
     * @param {Node} anchorNode
     * @returns {boolean}
     * @memberof Annotation
     */
    static canHighlight = (anchorNode: Node): boolean => {
      const highlighted = (el) => el.classList.contains(CLASS_HIGHLIGHT);
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
    colors: Color[];
    annotations: { [key: string]: Annotation };
    tooltipManager: TooltipManager;

    constructor(colors) {
      this.colors = colors;
      this.annotations = {};
      this.tooltipManager = new TooltipManager(colors);
      this.loadAnnotationsFromLocalStorage();
    }

    loadAnnotationsFromLocalStorage = (): void => {
      for (let i = 0; i < window.localStorage.length; i++) {
        try {
          const id = window.localStorage.key(i);
          const annotation = Annotation.fromJSON(
            window.localStorage.getItem(id)
          );

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
      this.elementWithHighlight(annotation.path);

      const selection = window.getSelection();
      const range = selection.getRangeAt(0).cloneRange();

      this.insertAnnotationIntoDOM(annotation, range);
      window.localStorage.setItem(annotation.id, JSON.stringify(annotation));

      selection.removeAllRanges();
      selection.addRange(range);
    };

    whereToInsert = (
      element: Element,
      annotation: Annotation
    ): [Text, number, number] | null => {
      const { regex, pos } = annotation;

      let curr: Node = element.firstChild;
      while (curr) {
        let start = 0;
        let end = 0;
        let matchPos = -1;
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

    /**
     * Determines which element contains the highlight.
     *
     * @param  {[[string, number]]} path
     */
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

    startSelectionInteraction = () => {
      const selection = window.getSelection();
      const { anchorOffset, focusOffset } = selection;

      // Make sure selection goes from left to right
      const leftToRight = anchorOffset < focusOffset;
      const anchor = leftToRight ? selection.anchorNode : selection.focusNode;
      const offset = leftToRight ? anchorOffset : focusOffset;

      const annotation = new Annotation(anchor, offset, selection.toString());

      const { x, y, height } = selection.getRangeAt(0).getBoundingClientRect();
      const scrollTop = document.scrollingElement.scrollTop;
      const scrollLeft = document.scrollingElement.scrollLeft;
      this.tooltipManager.showTooltip(
        annotation,
        x + scrollLeft,
        y + scrollTop,
        height,
        this.updateColor,
        this.addAnnotation
      );
    };

    // Functions that manipulate the DOM
    updateColor = (annotation: Annotation, newColor: Color) => {
      const highlights = document.getElementsByClassName(CLASS_HIGHLIGHT);
      for (let i = 0; i < highlights.length; i++) {
        const highlight = highlights[i] as HTMLElement;
        if (highlight.getAttribute("annotate-id") === annotation.id) {
          highlight.style.backgroundColor = newColor;
        }
      }
    };

    insertAnnotationIntoDOM = (annotation: Annotation, range: Range) => {
      const { id, highlightColor } = annotation;

      // Note: code adapted from Abhay Padda's answer: https://stackoverflow.com/a/53909619/7427716
      const span = document.createElement("span");
      span.className = CLASS_HIGHLIGHT;
      span.setAttribute("annotate-id", id);
      span.style.backgroundColor = highlightColor || FALLBACK_COLOR;

      span.onclick = () => {
        const scrollLeft = document.scrollingElement.scrollLeft;
        const scrollTop = document.scrollingElement.scrollTop;
        const x = scrollLeft + span.getBoundingClientRect().x;
        const y = scrollTop + span.getBoundingClientRect().y;
        const lineHeight = span.offsetHeight;

        this.tooltipManager.showTooltip(
          annotation,
          x,
          y,
          lineHeight,
          this.updateColor,
          this.addAnnotation
        );
      };

      range.surroundContents(span);
    };
  }

  class TooltipManager {
    colors: Color[];
    tooltip: HTMLElement;

    constructor(colors) {
      this.colors = colors;
      this.tooltip = document.getElementById(ID_TOOLTIP);
      this.addColorButtons();
    }

    // DOM manipulation:
    addColorButtons = (): void => {
      for (let i = 0; i < this.colors.length; i++) {
        const color = this.colors[i];
        const colorButton = document.createElement("button");
        colorButton.setAttribute("class", CLASS_COLOR_BUTTON);
        colorButton.setAttribute(COLOR_ATTRIBUTE, "" + i);
        colorButton.style.backgroundColor = color;
        this.tooltip.appendChild(colorButton);
      }
    };

    showTooltip = (
      annotation: Annotation,
      x: number,
      y: number,
      lineHeight: number,
      updateColor: (Annotation, Color) => void,
      addAnnotation: (Annotation, Color) => void
    ) => {
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
      this.tooltip.style.visibility = "visible";

      // Bind actions to tooltip color buttons
      const colorButtons =
        this.tooltip.getElementsByClassName(CLASS_COLOR_BUTTON);
      for (let i = 0; i < colorButtons.length; i++) {
        const button = colorButtons[i] as HTMLElement;
        button.onclick = () => {
          const idx = parseInt(button.getAttribute(COLOR_ATTRIBUTE));
          const newColor =
            this.colors[idx] ||
            this.colors[FALLBACK_COLOR_IDX] ||
            FALLBACK_COLOR;
          if (
            annotation.highlightColor &&
            annotation.highlightColor !== newColor
          ) {
            annotation.highlightColor = newColor;
            updateColor(annotation, newColor);
            // TODO: implement update of local storage object
          } else {
            addAnnotation(annotation, newColor);
            const selection = window.getSelection();
            selection.removeAllRanges();
          }
        };
      }
    };
  }

  class Annotate {
    annotationManager: AnnotationManager;

    constructor(colors: Color[]) {
      // TODO: merge Annotate and AnnotateManager? export AnnotationManager as
      this.annotationManager = new AnnotationManager(colors);
      document.addEventListener("mouseup", this.handleSelection);

      const navigator = document.getElementById(ID_NAVIGATOR);
      if (navigator) {
        navigator.onclick = () => {
          navigator.style.visibility = "hidden";
        };
      }
      const toggle = document.getElementById(ID_TOGGLE);
      if (toggle) {
        toggle.textContent = "a";
        toggle.onclick = () => {
          const navigator = document.getElementById(ID_NAVIGATOR);
          if (navigator) {
            navigator.style.visibility = "visible";
          }
        };
      }
    }

    handleSelection = (event: MouseEvent): void => {
      const selection = window.getSelection();
      const { anchorNode, focusNode } = selection;

      const tooltip = document.getElementById(ID_TOOLTIP);
      const target = event.target as Element;
      const clickedTooltip = tooltip && tooltip.contains(target);
      if (clickedTooltip) {
        document.getElementById(ID_TOOLTIP).style.visibility = "hidden"; // TODO: move this under TooltipManager
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

// - bugs
// -> tooltip not closing after:
//    1. clicking elsewhere
//    2. removing range

// - cleanup
// -> stop working with regex and use text instead? implement in parallel before removing regex!

// - tooltip comments
// - tooltip delete button
//    -> 1. hoist children: https://stackoverflow.com/questions/1614658/how-do-you-undo-surroundcontents-in-javascript
//    -> 2. normalize text nodes: https://developer.mozilla.org/en-US/docs/Web/API/Node/normalize
//    (maybe also consult https://stackoverflow.com/a/57722235)
// - test it in an isolated scrollable
// - improve UX:
//    -> freeze selection, make it stay as long as tooltip is open?
//    -> animations
//    -> make sure the tooltip appears at the start of the selection -> get the smaller x coordinate of mouseup vs. mousedown
// - both students recommended:
//   -> allow the end users to select their own highlight color using a color picker
// - selection across nodes
//    -> would need a regex that can match words across nodes (probably - depends on the string returned by selection in case the selection is multi-node)
//    -> another problem: span layering -> how to handle what was clicked? What if a highlight is immersed in a large highlight? we'd need to make sure its event listener gets fired
// - store annotation IDs in a separate entry in local storage to prevent parsing everything
