// Data
class Annotation {
  constructor(anchorNode, highlightedString, comment) {
    // reconstruct path from root node to this node
    const path = constructPath(anchorNode);
    this.path = path;
    this.highlightedString = highlightedString;
    this.comment = comment;
  }

  static canHighlight(anchorNode) {
    const parent = anchorNode.parentElement;
    if (parent) {
      const parentHighlighted = parent.classList.contains("annotated");
      return !parentHighlighted;
    } else {
      return true;
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
    this.logAnnotations();
    this.highlightAnnotation(annotation);
  }

  highlightAnnotation(annotation) {
    const { path, highlightedString } = annotation;
    const node = retrieveNode(path); // TODO: take in node during fresh creation (not when coming from local storage)?

    // Determine where to insert highlight
    const start = node.innerHTML.indexOf(highlightedString);
    const end = start + highlightedString.length;

    // Add the highlight to innerHTML
    const beforeHighlight = node.innerHTML.substring(0, start);
    const toHighlight = node.innerHTML.substring(start, end);
    const afterHighlight = node.innerHTML.substring(end);
    const newHTML = `${beforeHighlight}<span class="annotated" style="background-color: yellow">${toHighlight}</span>${afterHighlight}`;
    node.innerHTML = newHTML;
  }

  logAnnotations() {
    this.annotations.map(console.log);
  }
}

// Helpers
const constructPath = (node) => {
  const path = [];
  let currentNode = node;
  while (currentNode.parentNode) {
    // only keep Element Nodes so that we can use querySelector
    if (currentNode.nodeType !== Node.ELEMENT_NODE) {
      currentNode = currentNode.parentNode;
      continue;
    }
    // determine which child to look at
    const siblings = currentNode.parentNode.childNodes;
    let childIdx = 0;
    for (sibling of siblings) {
      if (sibling.nodeName === currentNode.nodeName) {
        if (sibling === currentNode) {
          break;
        }
        childIdx++;
      }
    }
    const tuple = [currentNode.nodeName.toLowerCase(), childIdx];
    path.push(tuple);
    currentNode = currentNode.parentNode;
  }
  path.reverse();
  return path;
};

const retrieveNode = (path) => {
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

document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection();
  const anythingSelected = selection.toString().length;
  const sameNode = selection.anchorNode.isSameNode(selection.focusNode);
  console.log(selection.anchorNode.className);
  if (anythingSelected && sameNode) {
    if (Annotation.canHighlight(selection.anchorNode)) {
      const annotation = new Annotation(
        selection.anchorNode,
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
