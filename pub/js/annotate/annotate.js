document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection();
  if (selection.toString().length) {
    // TODO: only allow selection within a given node
    console.log(selection.anchorNode.isSameNode(selection.focusNode));
    console.log(selection.toString());
  }
});
