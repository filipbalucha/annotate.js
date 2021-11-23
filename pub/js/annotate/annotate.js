// Global constants
DEFAULT_COLOR = "yellow";
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

    const element = this.elementWithHighlight(path);
    const [start, end] = this.whereToInsert(element, annotation);
    this.insertAnnotationIntoDOM(element, annotation, start, end);
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
    this.tooltipManager.showTooltip(
      annotation,
      x,
      y,
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
   * Inserts the annotation into the DOM at the position bounded by [start, end)
   * and marks it with the corresponding annotation's ID.
   *
   * @param  {Element} element
   * @param  {number} start
   * @param  {number} end
   * @param  {number} id
   * @param  {string} color
   */
  insertAnnotationIntoDOM = (element, annotation, start, end) => {
    const { id, highlightColor } = annotation;

    // Note: code adapted from Abhay Padda's answer: https://stackoverflow.com/a/53909619/7427716
    const span = document.createElement("span");
    span.className = CLASS_HIGHLIGHT;
    span.setAttribute("annotate-id", id); //TODO: string?
    span.style.backgroundColor = highlightColor;
    span.onclick = () => {
      const x = span.offsetLeft;
      const y = span.offsetTop;
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
    const viewportHeight = window.visualViewport.height;
    const tooltipHeight = 0.05 * viewportHeight;

    const isAboveViewport = y - tooltipHeight < 0;

    const scrollTop = document.scrollingElement.scrollTop;
    let offsetTop;
    if (isAboveViewport) {
      offsetTop = scrollTop + y + lineHeight;
    } else {
      offsetTop = scrollTop + y - tooltipHeight;
    }
    this.tooltip.style.transform = `translate(min(${x}px, 68vw), ${offsetTop}px`;
    this.tooltip.style.visibility = "visible";

    // Bind actions to tooltip color buttons
    const colorButtons =
      this.tooltip.getElementsByClassName(CLASS_COLOR_BUTTON);
    for (const button of colorButtons) {
      button.onclick = () => {
        const idx = parseInt(button.getAttribute(COLOR_ATTRIBUTE));
        const newColor = this.colors[idx] || DEFAULT_COLOR;
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
  constructor(colors) {
    this.annotationManager = new AnnotationManager(colors);
    document.addEventListener("mouseup", this.handleSelection);
  }

  handleSelection = () => {
    const selection = window.getSelection();
    const { anchorNode, focusNode } = selection;

    const shouldStartSelectionInteraction =
      selection.toString().length &&
      anchorNode.isSameNode(focusNode) &&
      Annotation.canHighlight(anchorNode);

    if (shouldStartSelectionInteraction) {
      this.annotationManager.startSelectionInteraction();
    }
  };
}

// TODO: style:
// - color buttons
// - tooltip (fix alignment between tooltip 1 and 2)

// TODO:
// - clean up arguments, remove unnecessary methods

// TODO: 0. onclick elsewhere => hide tooltip

// TODO: 1. how to freeze selection / make it stay as long as tooltip is open?

// TODO: 2. tooltip comments

// TODO: 3. localstorage
// -> store (what does tooltip need?)
//    -> how to retrieve position of text within a node? create a selection from scratch?
// -> load

// TODO: 4. animation

// TODO: 6. other improvements
// - make highlight adding async?
// - make sure the tooltip appears at the start of the selection -> get the smaller x coordinate of mouseup vs. mousedown

// TODO: 7. cleanup - constants for HTML tags and ids; doc strings

// TODO: 8. extract some parameters such as tooltip height etc.

// TODO: 9. consider selection across nodes - would need a regex that can match words across nodes (probably - depends on the string returned by selection in case the selection is multi-node)

// TODO: 10. Optimize for multiple sub-pages: store URL, filter out query strings
