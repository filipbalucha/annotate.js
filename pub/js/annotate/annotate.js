// Global constants
var FALLBACK_COLOR_IDX = 0;
var FALLBACK_COLOR = "yellow";
var COLOR_ATTRIBUTE = "annotate-color";
var CLASS_HIGHLIGHT = "__annotate-highlight__";
var ID_TOOLTIP = "__annotate-tooltip__";
var CLASS_COLOR_BUTTON = "__annotate-color__";
var ID_NAVIGATOR = "__annotate-navigator__";
var ID_TOGGLE = "__annotate-toggle__";
var Annotation = /** @class */ (function () {
    function Annotation(anchor, anchorOffset, highlightedString, comment) {
        var _this = this;
        this.generateRandomId = function () {
            // Adapted from rinogo's answer: https://stackoverflow.com/a/66332305/7427716
            var id = window.URL.createObjectURL(new Blob([])).substr(-12);
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
        this.positionWithinParentElement = function (anchor, anchorOffset, regex) {
            var gRegex = new RegExp(regex, "g");
            var offset = _this.preAnchorOffset(anchor) + anchorOffset;
            var beforeAnchorString = anchor.parentElement.innerHTML.substring(0, offset);
            var matches = beforeAnchorString.match(gRegex);
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
        this.innerHtmlReadyRegex = function (string) {
            // This pattern will ignore space, line feed and other Unicode spaces between the words
            var pattern = string.replace(/\s+/g, "(\\s+)");
            var regex = new RegExp(pattern);
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
        this.preAnchorOffset = function (anchor) {
            var preAnchorOffset = 0;
            var leftSibling = anchor.previousSibling;
            while (leftSibling) {
                if (leftSibling.outerHTML) {
                    preAnchorOffset += leftSibling.outerHTML.length;
                }
                else if (leftSibling.textContent) {
                    preAnchorOffset += leftSibling.textContent.length;
                }
                else {
                    console.error("Annotate: unsupported node type: ".concat(leftSibling.nodeType), leftSibling);
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
        this.pathTo = function (node) {
            var path = [];
            var currentEl = node;
            while (currentEl.parentElement) {
                var siblings = currentEl.parentElement.children;
                var childIdx = 0;
                for (var i = 0; i < siblings.length; i++) {
                    var sibling = siblings[i];
                    if (sibling.tagName === currentEl.tagName) {
                        if (sibling === currentEl) {
                            break;
                        }
                        childIdx++;
                    }
                }
                var pathStep = [currentEl.tagName.toLowerCase(), childIdx];
                path.push(pathStep);
                currentEl = currentEl.parentElement;
            }
            path.reverse();
            return path;
        };
        this.path = this.pathTo(anchor.parentElement);
        this.comment = comment;
        this.regex = this.innerHtmlReadyRegex(highlightedString);
        this.encodedRegex = encodeURIComponent(this.regex.source);
        this.pos = this.positionWithinParentElement(anchor, anchorOffset, this.regex);
        this.highlightColor = null;
        this.id = this.generateRandomId();
    }
    Annotation.fromJSON = function (json) {
        var annotation = JSON.parse(json);
        annotation.regex = new RegExp(decodeURIComponent(annotation.encodedRegex));
        return annotation;
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
    Annotation.canHighlight = function (anchorNode) {
        var highlighted = function (el) { return el.classList.contains(CLASS_HIGHLIGHT); };
        if (anchorNode.nodeType === Node.ELEMENT_NODE) {
            return !highlighted(anchorNode);
        }
        else if (anchorNode.parentElement) {
            return !highlighted(anchorNode.parentElement);
        }
        else {
            return true;
        }
    };
    return Annotation;
}());
var AnnotationManager = /** @class */ (function () {
    function AnnotationManager(colors) {
        var _this = this;
        this.loadAnnotationsFromLocalStorage = function () {
            for (var i = 0; i < window.localStorage.length; i++) {
                try {
                    var id = window.localStorage.key(i);
                    var annotation = Annotation.fromJSON(window.localStorage.getItem(id));
                    var range = _this.annotationRange(annotation);
                    _this.insertAnnotationIntoDOM(annotation, range);
                }
                catch (e) {
                    console.error("Could not parse annotation");
                    console.error(e);
                }
            }
        };
        this.annotationRange = function (annotation) {
            // Determine where to insert annotation
            var path = annotation.path;
            var element = _this.elementWithHighlight(path);
            if (!element) {
                console.error("Could not find Annotation on the webpage. Annotate.js does not work on webpages whose content changes dynamically.");
                throw new Error("Could not find annotation's element");
            }
            // Manually create a range
            var _a = _this.whereToInsert(element, annotation), node = _a[0], start = _a[1], end = _a[2];
            var _ = node.splitText(end);
            var center = node.splitText(start);
            var range = document.createRange();
            range.selectNode(center);
            return range;
        };
        this.addAnnotation = function (annotation, color) {
            var id = annotation.id;
            annotation.highlightColor = color;
            _this.annotations[id] = annotation;
            _this.elementWithHighlight(annotation.path);
            var selection = window.getSelection();
            var range = selection.getRangeAt(0).cloneRange();
            _this.insertAnnotationIntoDOM(annotation, range);
            window.localStorage.setItem(annotation.id, JSON.stringify(annotation));
            selection.removeAllRanges();
            selection.addRange(range);
        };
        this.whereToInsert = function (element, annotation) {
            var regex = annotation.regex, pos = annotation.pos;
            var curr = element.firstChild;
            while (curr) {
                var start = 0;
                var end = 0;
                var matchPos = -1;
                var match = void 0;
                // Recursively search current node for matches
                while ((match = curr.textContent.substring(end).match(regex))) {
                    // Note: Cannot use a global regex here as those do not return index in their matches
                    matchPos++;
                    start = end + match.index;
                    end += match.index + match[0].length;
                    if (matchPos === pos) {
                        return [curr, start, end];
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
        this.elementWithHighlight = function (path) {
            if (path.length === 0) {
                return null;
            }
            var node = document;
            for (var _i = 0, path_1 = path; _i < path_1.length; _i++) {
                var _a = path_1[_i], tag = _a[0], childIdx = _a[1];
                node = node.getElementsByTagName(tag)[childIdx];
            }
            return node;
        };
        this.startSelectionInteraction = function () {
            var selection = window.getSelection();
            var anchorOffset = selection.anchorOffset, focusOffset = selection.focusOffset;
            // Make sure selection goes from left to right
            var leftToRight = anchorOffset < focusOffset;
            var anchor = leftToRight ? selection.anchorNode : selection.focusNode;
            var offset = leftToRight ? anchorOffset : focusOffset;
            var annotation = new Annotation(anchor, offset, selection.toString());
            var _a = selection.getRangeAt(0).getBoundingClientRect(), x = _a.x, y = _a.y, height = _a.height;
            var scrollTop = document.scrollingElement.scrollTop;
            var scrollLeft = document.scrollingElement.scrollLeft;
            _this.tooltipManager.showTooltip(annotation, x + scrollLeft, y + scrollTop, height, _this.updateColor, _this.addAnnotation);
        };
        // Functions that manipulate the DOM
        this.updateColor = function (annotation, newColor) {
            var highlights = document.getElementsByClassName(CLASS_HIGHLIGHT);
            for (var i = 0; i < highlights.length; i++) {
                var highlight = highlights[i];
                if (highlight.getAttribute("annotate-id") === annotation.id) {
                    highlight.style.backgroundColor = newColor;
                }
            }
        };
        this.insertAnnotationIntoDOM = function (annotation, range) {
            var id = annotation.id, highlightColor = annotation.highlightColor;
            // Note: code adapted from Abhay Padda's answer: https://stackoverflow.com/a/53909619/7427716
            var span = document.createElement("span");
            span.className = CLASS_HIGHLIGHT;
            span.setAttribute("annotate-id", id);
            span.style.backgroundColor = highlightColor || FALLBACK_COLOR;
            span.onclick = function () {
                var scrollLeft = document.scrollingElement.scrollLeft;
                var scrollTop = document.scrollingElement.scrollTop;
                var x = scrollLeft + span.getBoundingClientRect().x;
                var y = scrollTop + span.getBoundingClientRect().y;
                var lineHeight = span.offsetHeight;
                _this.tooltipManager.showTooltip(annotation, x, y, lineHeight, _this.updateColor, _this.addAnnotation);
            };
            range.surroundContents(span);
        };
        this.colors = colors;
        this.annotations = {};
        this.tooltipManager = new TooltipManager(colors);
        this.loadAnnotationsFromLocalStorage();
    }
    return AnnotationManager;
}());
var TooltipManager = /** @class */ (function () {
    function TooltipManager(colors) {
        var _this = this;
        // DOM manipulation:
        this.addColorButtons = function () {
            for (var i = 0; i < _this.colors.length; i++) {
                var color = _this.colors[i];
                var colorButton = document.createElement("button");
                colorButton.setAttribute("class", CLASS_COLOR_BUTTON);
                colorButton.setAttribute(COLOR_ATTRIBUTE, "" + i);
                colorButton.style.backgroundColor = color;
                _this.tooltip.appendChild(colorButton);
            }
        };
        this.showTooltip = function (annotation, x, y, lineHeight, updateColor, addAnnotation) {
            // Prevent vertical overflow
            var offsetTop;
            var tooltipHeight = _this.tooltip.offsetHeight;
            var scrollTop = document.scrollingElement.scrollTop;
            var isAboveViewport = y - scrollTop - tooltipHeight < 0;
            if (isAboveViewport) {
                offsetTop = y + lineHeight;
            }
            else {
                offsetTop = y - tooltipHeight;
            }
            // Prevent horizontal overflow
            var offsetLeft;
            var viewportWidth = window.visualViewport.width;
            var tooltipWidth = _this.tooltip.offsetWidth;
            var scrollLeft = document.scrollingElement.scrollLeft;
            var isBeyondViewport = x - scrollLeft + tooltipWidth > viewportWidth;
            if (isBeyondViewport) {
                offsetLeft = scrollLeft + viewportWidth - tooltipWidth;
            }
            else {
                offsetLeft = x;
            }
            _this.tooltip.style.transform = "translate(".concat(offsetLeft, "px, ").concat(offsetTop, "px");
            _this.tooltip.style.visibility = "visible";
            // Bind actions to tooltip color buttons
            var colorButtons = _this.tooltip.getElementsByClassName(CLASS_COLOR_BUTTON);
            var _loop_1 = function (i) {
                var button = colorButtons[i];
                button.onclick = function () {
                    var idx = parseInt(button.getAttribute(COLOR_ATTRIBUTE));
                    var newColor = _this.colors[idx] || _this.colors[FALLBACK_COLOR_IDX] || FALLBACK_COLOR;
                    if (annotation.highlightColor &&
                        annotation.highlightColor !== newColor) {
                        annotation.highlightColor = newColor;
                        updateColor(annotation, newColor);
                        // TODO: implement update of local storage object
                    }
                    else {
                        addAnnotation(annotation, newColor);
                        var selection = window.getSelection();
                        selection.removeAllRanges();
                    }
                };
            };
            for (var i = 0; i < colorButtons.length; i++) {
                _loop_1(i);
            }
        };
        this.colors = colors;
        this.tooltip = document.getElementById(ID_TOOLTIP);
        this.addColorButtons();
    }
    return TooltipManager;
}());
var Annotate = /** @class */ (function () {
    function Annotate(colors) {
        var _this = this;
        this.handleSelection = function (event) {
            var selection = window.getSelection();
            var anchorNode = selection.anchorNode, focusNode = selection.focusNode;
            var tooltip = document.getElementById(ID_TOOLTIP);
            var target = event.target;
            var clickedTooltip = tooltip && tooltip.contains(target);
            if (clickedTooltip) {
                document.getElementById(ID_TOOLTIP).style.visibility = "hidden"; // TODO: move this under TooltipManager
            }
            var shouldStartSelectionInteraction = selection.toString().length &&
                anchorNode.isSameNode(focusNode) &&
                Annotation.canHighlight(anchorNode) &&
                !clickedTooltip;
            if (shouldStartSelectionInteraction) {
                _this.annotationManager.startSelectionInteraction();
            }
        };
        // TODO: merge Annotate and AnnotateManager? export AnnotationManager as
        this.annotationManager = new AnnotationManager(colors);
        document.addEventListener("mouseup", this.handleSelection);
        var navigator = document.getElementById(ID_NAVIGATOR);
        if (navigator) {
            navigator.onclick = function () {
                navigator.style.visibility = "hidden";
            };
        }
        var toggle = document.getElementById(ID_TOGGLE);
        if (toggle) {
            toggle.textContent = "a";
            toggle.onclick = function () {
                var navigator = document.getElementById(ID_NAVIGATOR);
                if (navigator) {
                    navigator.style.visibility = "visible";
                }
            };
        }
    }
    return Annotate;
}());
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
