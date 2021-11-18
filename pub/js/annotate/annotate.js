// Data
class Annotation {
  constructor(anchorNode, anchorOffset, highlightedString, comment) {
    // reconstruct path from root node to this node
    // TODO: what if no parentElement? Just ignore it?
    // TODO: what if anchorNode is an element?
    const path = constructPath(anchorNode.parentElement);

    // TODO: 1. string searching algos

    this.path = path;
    this.highlightedString = highlightedString;
    const minIdx = this.findIdxInParent(
      anchorNode,
      anchorOffset,
      highlightedString
    );
    this.pos = this.findMatchPosInParent(anchorNode, minIdx);
    this.comment = comment;
  }

  findIdxInParent(anchor, anchorOffset, substring) {
    // Find contents preceding the node
    const leftSiblingContents = [];
    let prevSibling = anchor.previousSibling;
    while (prevSibling) {
      leftSiblingContents.push(prevSibling.textContent);
      prevSibling = prevSibling.previousSibling;
    }
    leftSiblingContents.reverse();

    // Determine the index of selection within the parent's HTML
    const parent = anchor.parentElement;
    let parentHTML = parent.innerHTML;
    let preAnchorOffset = 0;
    // Walk the inner HTML from left until anchor
    for (const content of leftSiblingContents) {
      preAnchorOffset += parentHTML.indexOf(content);
    }
    const offset = preAnchorOffset + anchorOffset;
    const idxInParent =
      offset + parentHTML.substring(offset).indexOf(substring);

    console.log(idxInParent);

    // TODO: find number of matches
  }

  findIdxInParent() {}

  indexOfNthMatch() {}

  static canHighlight(anchorNode) {
    if (anchorNode.nodeType === Node.ELEMENT_NODE) {
      const highlighted = anchorNode.classList.contains("annotated");
      return !highlighted;
    } else {
      const parent = anchorNode.parentElement;
      if (parent) {
        const parentHighlighted = parent.classList.contains("annotated");
        return !parentHighlighted;
      } else {
        return true;
      }
    }
  }
}

class AnnotationManager {
  constructor() {
    // TODO: mapping instead?
    this.annotations = [];
  }

  addAnnotation(annotation) {
    this.annotations.push(annotation);
    this.highlightAnnotation(annotation);
  }

  highlightAnnotation(annotation) {
    const { path, highlightedString } = annotation;
    const element = elementToHighlight(path);
    console.log(element);

    // Determine where to insert highlight
    const start = element.innerHTML.indexOf(highlightedString);
    const end = start + highlightedString.length;

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
const constructPath = (el) => {
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
  const anythingSelected = selection.toString().length;
  const sameNode = selection.anchorNode.isSameNode(selection.focusNode);
  if (anythingSelected && sameNode) {
    if (Annotation.canHighlight(selection.anchorNode)) {
      const annotation = new Annotation(
        selection.anchorNode,
        selection.anchorOffset,
        selection.toString()
      );
      annotationManager.addAnnotation(annotation);
    }

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
