// Global constants
FALLBACK_COLOR_IDX = 0;
COLOR_ATTRIBUTE = "annotate-color";
CLASS_HIGHLIGHT = "__annotate-highlight__";
ID_TOOLTIP = "__annotate-tooltip__";
CLASS_COLOR_BUTTON = "__annotate-color__";

// Data
class Annotation {
  constructor(anchor, anchorOffset, highlightedString, comment) {
    this.path = this.pathTo(anchor.parentElement);
    this.comment = comment;
    this.regex = this.innerHtmlReadyRegex(highlightedString);
    this.pos = this.positionWithinParentElement(
      anchor,
      anchorOffset,
      this.regex
    );
    this.highlightColor = null;
    this.id = this.generateRandomId();
  }

  generateRandomId = () => {
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
  positionWithinParentElement = (anchor, anchorOffset, regex) => {
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
  pathTo = (node) => {
    const path = [];
    let currentEl = node;
    while (currentEl.parentElement) {
      const siblings = currentEl.parentElement.children;
      let childIdx = 0;
      for (const sibling of siblings) {
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
  static canHighlight = (anchorNode) => {
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
  constructor(colors) {
    this.colors = colors;
    this.annotations = {};
    this.tooltipManager = new TooltipManager(colors);
  }

  addAnnotation = (annotation, color) => {
    const { path, id } = annotation;

    annotation.highlightColor = color;
    this.annotations[id] = annotation;

    // TODO: may be useful during reconstruction
    // const element = this.elementWithHighlight(path);
    // const [start, end] = this.whereToInsert(element, annotation);
    this.insertAnnotationIntoDOM(annotation);
  };

  /**
   * Returns the start and end position of where to insert the annotation in
   * element.
   *
   * @param {Node} element
   * @param {Annotation} annotation
   * @returns {[number, number]}
   * @memberof AnnotationManager
   */
  whereToInsert = (element, annotation) => {
    const { regex, pos } = annotation;

    // Cannot use a global regex here as those do not return index in their matches
    let matchPos = -1;
    let start = 0;
    let end = 0;
    while (matchPos !== pos) {
      const match = element.innerHTML.substring(end).match(regex);
      start = end + match.index;
      end += match.index + match[0].length;
      matchPos++;
    }

    return [start, end];
  };

  /**
   * Determines which element contains the highlight.
   *
   * @param  {[[string, number]]} path
   */
  elementWithHighlight = (path) => {
    let node = document;
    for (const [tag, childIdx] of path) {
      node = node.getElementsByTagName(tag)[childIdx];
    }
    return node;
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
  updateColor = (annotation, newColor) => {
    const highlights = document.getElementsByClassName(CLASS_HIGHLIGHT);
    for (const highlight of highlights) {
      if (highlight.getAttribute("annotate-id") === annotation.id) {
        highlight.style.backgroundColor = newColor;
      }
    }
  };

  /**
   * Inserts the annotation into the DOM.
   *
   * @param  {Annotation} annotation
   */
  insertAnnotationIntoDOM = (annotation) => {
    const { id, highlightColor } = annotation;

    // Note: code adapted from Abhay Padda's answer: https://stackoverflow.com/a/53909619/7427716
    const span = document.createElement("span");
    span.className = CLASS_HIGHLIGHT;
    span.setAttribute("annotate-id", id);
    span.style.backgroundColor = highlightColor;

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

    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0).cloneRange();
      range.surroundContents(span);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };
}

class TooltipManager {
  constructor(colors) {
    this.colors = colors;
    this.tooltip = document.getElementById(ID_TOOLTIP);
    this.addColorButtons();
  }

  // DOM manipulation:
  addColorButtons = () => {
    for (let i = 0; i < this.colors.length; i++) {
      const color = this.colors[i];
      const colorButton = document.createElement("button");
      colorButton.setAttribute("class", CLASS_COLOR_BUTTON);
      colorButton.setAttribute(COLOR_ATTRIBUTE, i);
      colorButton.style.backgroundColor = color;
      this.tooltip.appendChild(colorButton);
    }
  };

  showTooltip = (annotation, x, y, lineHeight, updateColor, addAnnotation) => {
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
    for (const button of colorButtons) {
      button.onclick = () => {
        const idx = parseInt(button.getAttribute(COLOR_ATTRIBUTE));
        const newColor =
          this.colors[idx] || this.colors[FALLBACK_COLOR_IDX] || "yellow";
        if (
          annotation.highlightColor &&
          annotation.highlightColor !== newColor
        ) {
          annotation.highlightColor = newColor;
          updateColor(annotation, newColor);
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
  // TODO: merge Annotate and AnnotateManager?
  constructor(colors) {
    this.annotationManager = new AnnotationManager(colors);
    document.addEventListener("mouseup", this.handleSelection);
  }

  handleSelection = (event) => {
    const selection = window.getSelection();
    const { anchorNode, focusNode } = selection;

    const shouldStartSelectionInteraction =
      selection.toString().length &&
      anchorNode.isSameNode(focusNode) &&
      Annotation.canHighlight(anchorNode);

    if (shouldStartSelectionInteraction) {
      this.annotationManager.startSelectionInteraction();
    } else if (!event.target.classList.contains(CLASS_COLOR_BUTTON)) {
      document.getElementById(ID_TOOLTIP).style.visibility = "hidden"; // TODO: move this under TooltipManager
    }
  };
}

// TODO:
// - local storage
//    -> add range when reconstructing selections or do node splitting and insertion using insertBefore (https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore)
// - tooltip comments
// - tooltip delete button
//    -> useful: https://stackoverflow.com/questions/1614658/how-do-you-undo-surroundcontents-in-javascript
// - optimize for multiple sub-pages
//    -> each annotation storage will be bound to a URL (with filtered out query strings, etc.)
//    -> useful: https://developer.mozilla.org/en-US/docs/Web/API/URL
// - test it in an isolated scrollable
// - improve UX:
//    -> freeze selection, make it stay as long as tooltip is open?
//    -> animations
//    -> make sure the tooltip appears at the start of the selection -> get the smaller x coordinate of mouseup vs. mousedown
// - selection across nodes
//    -> would need a regex that can match words across nodes (probably - depends on the string returned by selection in case the selection is multi-node)
//    -> another problem: span layering -> how to handle what was clicked? What if a highlight is immersed in a large highlight? we'd need to make sure its event listener gets fired
