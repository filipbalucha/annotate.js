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
   * Determines the path to node from the root element. The path is a
   * sequence of steps, where each step is represented by tag name
   * (this is the tag of the element which we should follow at the given
   * step) and a number (this is to determine which child with that tag
   * we should follow)
   *
   * @param  {Node} node
   * @returns {[[string, number]]}
   */
  pathTo(node) {
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

    const element = this.elementWithHighlight(annotation.path);
    const [start, end] = this.whereToInsert(element, annotation);
    this.insertAnnotationIntoDOM(element, start, end);
  }

  /**
   * Returns the start and end position of where to insert the annotation in
   * element.
   *
   * @param {Node} element
   * @param {Annotation} annotation
   * @returns {[number, number]}
   * @memberof AnnotationManager
   */
  whereToInsert(element, annotation) {
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
  }
  /**
   * Determines which element contains the highlight.
   *
   * @param  {[[string, number]]} path
   */
  elementWithHighlight(path) {
    let node = document;
    for (const [tag, childIdx] of path) {
      node = node.getElementsByTagName(tag)[childIdx];
    }
    return node;
  }
  /**
   * Inserts the annotation into the DOM at the position bounded by [start, end)
   *
   * @param  {Element} element
   * @param  {number} start
   * @param  {number} end
   */
  insertAnnotationIntoDOM(element, start, end) {
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

      // TODO: re-think this:

      // Motivation: If we want to support real-time color changes, we need to insert the <span> node after every highlight, identify it as temp,
      // and modify it accordingly.
      // -> need remove highlight function

      // What will the interaction look like?
      // Adding:
      // - select text
      // - pick color
      // - (add comment)
      // - click tick to confirm, else it gets removed

      // Modification:
      // - click on highlighted text
      // - (change color)
      // - (change comment)
      // - NO confirm button

      // If it is annoying, can solve it two ways:
      // 1. display a less intrusive component
      // 2. use a flag to enable highlights (easier but less intuitive / worse UX)

      // Prepare the demo tooltip such that it counts on <span> being inserted:
      // select text
      // -> create annotation, store it in AnnotationManager.unsavedAnnotation only
      // -> insert span
      //    - no color initially
      //    - attribute unsaved=true
      //    - onclick = show tooltip (if not already visible)
      // -> get span's position, display tooltip above it
      // -> pick color (onclick =>
      //    - modify own CSS
      //    - move annotation from unsavedAnnotation to annotations in AnnotationManager (if haven't already done so)
      //    - set unsaved attribute on span to false
      // )
      // TODO: initial tooltip
      // - create Annotation (like above) -> store it in "tempAnnotation" in AnnotationManager
      // - get x coordinate of anchor
      // - display tooltip
      // -> position using translate
      // -> put it under a div anchor
      // -> onclick ->
      //    1. perform cleanup
      //       - remove div-anchor child if there is one (improvement: warn if the annotation has a comment)
      //       - reset tempAnnotation
      //    2. method in AnnotationManager (pass ID to it):
      //       - retrieve and remove Annotation from tempAnnotations using ID
      //       - move it to annotations
      //       - highlight it
    }

    // TODO: tooltip + mark colouring

    // TODO: 2. tooltip comments

    // TODO: 3. localstorage
    // -> store (what does tooltip need?)
    //    -> how to retrieve position of text within a node? create a selection from scratch?
    // -> load

    // TODO: 5. basic tooltip

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
