// Data
class Annotation {
  constructor(anchor, anchorOffset, highlightedString, comment) {
    this.path = pathTo(anchor.parentElement);
    this.comment = comment;
    this.regex = this.innerHtmlReadyRegex(highlightedString);
    this.pos = this.positionWithinParentElement(anchor, anchorOffset, this.regex)
  }

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
  positionWithinParentElement(anchor, anchorOffset, regex) {
    const gRegex = new RegExp(regex, "g");
    const offset = this.preAnchorOffset(anchor) + anchorOffset;
    const beforeAnchorString = anchor.parentElement.innerHTML.substring(
      0,
      offset
    );
    const matches = beforeAnchorString.match(gRegex);
    return matches ? matches.length : 0;
  }

  
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
  innerHtmlReadyRegex(string) {
    // This pattern will ignore space, line feed and other Unicode spaces between the words
    const pattern = string.replace(/\s+/g, "(\\s+)");
    const regex = new RegExp(pattern);

    return regex;
  }

  /**
   * Computes the offset of the anchor node within its parent element
   * by iterating over the contents of all its left siblings.
   *
   * @param {Node} anchor
   *
   * @returns {number}
   * @memberof Annotation
   */
  preAnchorOffset(anchor) {
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
  }

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
  static canHighlight(anchorNode) {
    const highlighted = (el) => el.classList.contains("annotated");
    if (anchorNode.nodeType === Node.ELEMENT_NODE) {
      return !highlighted(anchorNode);
    } else if (anchorNode.parentElement) {
      return !highlighted(anchorNode.parentElement);
    } else {
      return true;
    }
  }
}

class AnnotationManager {
  constructor() {
    // TODO: use mapping if Annotation get an ID
    this.annotations = [];
  }

  addAnnotation(annotation) {
    this.annotations.push(annotation);
    this.highlightAnnotation(annotation);
  }

  highlightAnnotation(annotation) {
    const { path, regex, pos } = annotation;
    const element = elementToHighlight(path);

    // Determine where to insert highlight
    let idx = 0;
    let string = element.innerHTML;
    let matchPos = -1;
    let match = undefined;
    while (matchPos !== pos) {
      match = string.match(regex);
      string = string.substring(match.index + match[0].length);
      idx += match.index + match[0].length;
      matchPos++;
    }
    if (match && match.index === -1) {
      console.error(
        "Could not highlight annotation: Could not find corresponding match."
      );
    }
    const start = idx - match[0].length;
    const end = idx;

    // Add the highlight to innerHTML
    const beforeHighlight = element.innerHTML.substring(0, start);
    const toHighlight = element.innerHTML.substring(start, end);
    const afterHighlight = element.innerHTML.substring(end);
    const newHTML = `${beforeHighlight}<span class="annotated" style="background-color: yellow">${toHighlight}</span>${afterHighlight}`;
    element.innerHTML = newHTML;
  }

  logAnnotations() {
    this.annotations.map(console.log);
  }
}

// Helpers
const pathTo = (el) => {
  const path = [];
  let currentEl = el;
  while (currentEl.parentElement) {
    // only keep Element Nodes so that we can use querySelector
    // determine which child to look at
    const siblings = currentEl.parentElement.children;
    let childIdx = 0;
    for (sibling of siblings) {
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

const elementToHighlight = (path) => {
  try {
    let node = document;
    for ([tag, childIdx] of path) {
      node = node.getElementsByTagName(tag)[childIdx];
    }
    return node;
  } catch (err) {
    console.error(err);
    return;
  }
};

// Application

const annotationManager = new AnnotationManager();

// Limitations list:
// - can only highlight within the same component (don't fix this, it's too complex to fix; having it this way gives us some guarantees re storing highlightedText matches - namely that we can ignore any HTML tags occurring during string search, because a highlight will always be within a single *node* only)
document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection();
  const { anchorNode, focusNode } = selection;

  const anythingSelected = selection.toString().length;
  const sameNode = anchorNode.isSameNode(focusNode);

  if (anythingSelected && sameNode) {
    if (Annotation.canHighlight(selection.anchorNode)) {
      const { anchorOffset, focusOffset } = selection;

      // Make sure selection goes from left to right
      const leftToRight = anchorOffset < focusOffset;
      const anchor = leftToRight ? selection.anchorNode : selection.focusNode;
      const offset = leftToRight ? anchorOffset : focusOffset;

      const annotation = new Annotation(anchor, offset, selection.toString());
      annotationManager.addAnnotation(annotation);
    }

    // TODO: 1. fix weird behaviour when there are line breaks

    // TODO: 2. marks
    // -> insert: into innerHTML, use anchor node offset
    // -> how to colour?
    // -> onClick -> to show tooltip

    // TODO: 3. localstorage
    // -> store (what does tooltip need?)
    //    -> how to retrieve position of text within a node? create a selection from scratch?
    // -> load

    // TODO: 4. basic tooltip

    // TODO: 5. fixes:
    // double click in empty space -> still considered a selection

    // TODO: 6. make highlight adding async?
  } else {
    console.info("Annotate: Please select content within the same element.");
  }
});

// TODO:
// if need text nodes, check here: https://stackoverflow.com/questions/54809603/select-text-node-using-queryselector
//    and the assoc. docs here: https://stackoverflow.com/questions/54809603/select-text-node-using-queryselector

// TODO: re: marks:
// Note: should not be a problem
// -> innerHTML can include \n whereas innerText and selection string does not
// -> may need a regex to get matches and indices in innerHTML
// -> likely not a problem because experimentation showed that offsets of Selection work

// TODO: for sorting nodes
// console.log(selection.anchorNode.getRootNode());
// console.log(
//   selection.anchorNode.compareDocumentPosition(selection.focusNode) &
//     Node.DOCUMENT_POSITION_FOLLOWING
// );
// console.log(
//   selection.anchorNode.compareDocumentPosition(
//     document.querySelector("h1")
//   ) & Node.DOCUMENT_POSITION_FOLLOWING
// );
// console.log(
//   document
//     .querySelector("h1")
//     .compareDocumentPosition(selection.anchorNode) &
//     Node.DOCUMENT_POSITION_FOLLOWING
// );

// ---------------- ACTUAL CODE ---------------------

/**
 * Returns the path from node's root element to node. The path is represented
 * as an array of tuples, where each tuple stores the element's tag name and
 * its position as child of its parent node.
 *
 * Note: Nodes that are not of type Element are ignored so that querySelector
 * can be used during path reconstruction.
 *
 * @param  {Node} node
 *
 * @returns {[[string, number]]} The path from node's root to node.
 */
