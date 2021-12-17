var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
(function (window, document) {
    // TODO: move to classes
    // Global constants
    var FALLBACK_COLOR_IDX = 0;
    var FALLBACK_COLOR = "yellow";
    var ID_TOOLTIP = "__annotate-tooltip__";
    var ID_COMMENT = "__annotate-comment__";
    var ID_DELETE_BUTTON = "__annotate-delete__";
    var COLOR_ATTRIBUTE = "annotate-color";
    var CLASS_COLOR_BUTTON = "__annotate-color__";
    var CLASS_COLOR_ROW = "__annotate-color-row__";
    var ATTRIBUTE_ANNOTATION_ID = "annotate-id";
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
            this.highlightedString = highlightedString;
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
            var highlighted = function (el) {
                return el.classList.contains(AnnotationManager.CLASS_HIGHLIGHT);
            };
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
        function AnnotationManager(colors, navigatorManager) {
            var _this = this;
            this.updateNavigator = function () {
                if (_this.navigatorManager) {
                    var annotationElements = document.getElementsByClassName(AnnotationManager.CLASS_HIGHLIGHT);
                    _this.navigatorManager.update(annotationElements, _this.annotations);
                }
            };
            // TODO: merge with addannotation somehow?
            this.loadAnnotationsFromLocalStorage = function () {
                for (var i = 0; i < window.localStorage.length; i++) {
                    try {
                        var id = window.localStorage.key(i);
                        var annotation = Annotation.fromJSON(window.localStorage.getItem(id));
                        _this.annotations[id] = annotation;
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
                var selection = window.getSelection();
                var range = selection.getRangeAt(0).cloneRange();
                _this.insertAnnotationIntoDOM(annotation, range);
                _this.updateAnnotationInLocalStorage(annotation);
                _this.updateNavigator();
                _this.tooltipManager.showDeleteButton(function () {
                    return _this.deleteAnnotation(annotation);
                });
                _this.tooltipManager.updateTooltipPosition();
                selection.removeAllRanges();
                selection.addRange(range);
            };
            this.whereToInsert = function (element, annotation) {
                var regex = annotation.regex, pos = annotation.pos;
                var curr = element.firstChild;
                var matchPos = -1;
                while (curr) {
                    var start = 0;
                    var end = 0;
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
            this.updateAnnotationColor = function (annotation, color) {
                annotation.highlightColor = color;
                _this.updateAnnotationInLocalStorage(annotation);
                _this.updateAnnotationColorInDOM(annotation, color);
                _this.updateNavigator();
            };
            this.updateAnnotationComment = function (annotation, newComment) {
                annotation.comment = newComment;
                _this.updateAnnotationInLocalStorage(annotation);
                _this.updateNavigator();
            };
            this.updateAnnotationInLocalStorage = function (annotation) {
                window.localStorage.setItem(annotation.id, JSON.stringify(annotation));
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
                _this.tooltipManager.showTooltip(annotation.comment, x + scrollLeft, y + scrollTop, height, function (color) { return _this.addAnnotation(annotation, color); }, function (comment) { return _this.updateAnnotationComment(annotation, comment); });
            };
            this.deleteAnnotation = function (annotation) {
                delete _this.annotations[annotation.id];
                window.localStorage.removeItem(annotation.id);
                _this.removeAnnotationFromDOM(annotation);
                _this.tooltipManager.hideTooltip();
            };
            // Functions that manipulate the DOM:
            this.updateAnnotationColorInDOM = function (annotation, color) {
                var annotationElement = _this.findAnnotationInDOM(annotation);
                annotationElement.style.backgroundColor = color;
            };
            this.findAnnotationInDOM = function (annotation) {
                var highlights = document.getElementsByClassName(AnnotationManager.CLASS_HIGHLIGHT);
                for (var i = 0; i < highlights.length; i++) {
                    var highlight = highlights[i];
                    if (highlight.getAttribute(ATTRIBUTE_ANNOTATION_ID) === annotation.id) {
                        return highlight;
                    }
                }
                return null;
            };
            this.removeAnnotationFromDOM = function (annotation) {
                // Note: code adapted from kennebec's answer: https://stackoverflow.com/a/1614909/7427716
                var annotationNode = _this.findAnnotationInDOM(annotation);
                var parentNode = annotationNode.parentNode;
                // Move all children of the annotation element under its parent
                while (annotationNode.firstChild) {
                    parentNode.insertBefore(annotationNode.firstChild, annotationNode);
                }
                parentNode.removeChild(annotationNode);
                // Join sibling text nodes
                parentNode.normalize();
            };
            this.insertAnnotationIntoDOM = function (annotation, range) {
                var id = annotation.id, highlightColor = annotation.highlightColor;
                // Note: code adapted from Abhay Padda's answer: https://stackoverflow.com/a/53909619/7427716
                var span = document.createElement("span");
                span.className = AnnotationManager.CLASS_HIGHLIGHT;
                span.setAttribute(ATTRIBUTE_ANNOTATION_ID, id);
                span.style.backgroundColor = highlightColor || FALLBACK_COLOR;
                span.onclick = function () {
                    var scrollLeft = document.scrollingElement.scrollLeft;
                    var scrollTop = document.scrollingElement.scrollTop;
                    var x = scrollLeft + span.getBoundingClientRect().x;
                    var y = scrollTop + span.getBoundingClientRect().y;
                    var lineHeight = span.offsetHeight;
                    _this.tooltipManager.showTooltip(annotation.comment, x, y, lineHeight, function (color) { return _this.updateAnnotationColor(annotation, color); }, function (comment) { return _this.updateAnnotationComment(annotation, comment); }, function () { return _this.deleteAnnotation(annotation); });
                };
                range.surroundContents(span);
            };
            this.colors = colors;
            this.annotations = {};
            this.tooltipManager = new TooltipManager(colors);
            this.loadAnnotationsFromLocalStorage();
            this.navigatorManager = navigatorManager;
            this.updateNavigator();
        }
        AnnotationManager.CLASS_HIGHLIGHT = "__annotate-highlight__";
        return AnnotationManager;
    }());
    var TooltipManager = /** @class */ (function () {
        function TooltipManager(colors) {
            var _this = this;
            this.addDeleteButton = function () {
                var deleteButton = document.createElement("button");
                var side = "1rem";
                deleteButton.innerHTML = "<svg fill=\"gray\" xmlns=\"http://www.w3.org/2000/svg\" width=".concat(side, " height=").concat(side, " viewBox=\"0 0 24 24\"><path d=\"M 10 2 L 9 3 L 3 3 L 3 5 L 4.109375 5 L 5.8925781 20.255859 L 5.8925781 20.263672 C 6.023602 21.250335 6.8803207 22 7.875 22 L 16.123047 22 C 17.117726 22 17.974445 21.250322 18.105469 20.263672 L 18.107422 20.255859 L 19.890625 5 L 21 5 L 21 3 L 15 3 L 14 2 L 10 2 z M 6.125 5 L 17.875 5 L 16.123047 20 L 7.875 20 L 6.125 5 z\"/></svg>");
                deleteButton.id = ID_DELETE_BUTTON;
                _this.tooltip.appendChild(deleteButton);
            };
            // DOM manipulation:
            this.addColorButtons = function () {
                var buttons = document.createElement("div");
                buttons.setAttribute("class", CLASS_COLOR_ROW);
                for (var i = 0; i < _this.colors.length; i++) {
                    var color = _this.colors[i];
                    var colorButton = document.createElement("button");
                    colorButton.className = CLASS_COLOR_BUTTON;
                    colorButton.setAttribute(COLOR_ATTRIBUTE, "" + i);
                    colorButton.style.backgroundColor = color;
                    buttons.appendChild(colorButton);
                }
                _this.tooltip.appendChild(buttons);
            };
            this.addCommentArea = function () {
                var commentArea = document.createElement("textarea");
                commentArea.id = ID_COMMENT;
                commentArea.placeholder = "Type a comment...";
                _this.tooltip.appendChild(commentArea);
            };
            this.updateTooltipPosition = function () {
                var _a = _this.anchorPosition, x = _a.x, y = _a.y, lineHeight = _a.lineHeight;
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
            };
            this.hideTooltip = function () {
                _this.tooltip.style.visibility = "hidden";
            };
            this.showDeleteButton = function (callback) {
                var deleteButton = document.getElementById(ID_DELETE_BUTTON);
                deleteButton.style.display = "";
                deleteButton.onclick = callback;
            };
            this.hideDeleteButton = function () {
                var deleteButton = document.getElementById(ID_DELETE_BUTTON);
                deleteButton.style.display = "none";
            };
            this.showTooltip = function (comment, x, y, lineHeight, selectColorCallback, updateCommentCallback, deleteAnnotationCallback) {
                if (deleteAnnotationCallback) {
                    _this.showDeleteButton(deleteAnnotationCallback);
                }
                else {
                    _this.hideDeleteButton();
                }
                _this.anchorPosition = { x: x, y: y, lineHeight: lineHeight };
                _this.updateTooltipPosition();
                _this.tooltip.style.visibility = "visible";
                // Add comment to comment area
                var commentArea = document.getElementById(ID_COMMENT);
                commentArea.value = comment || "";
                commentArea.onchange = function (e) {
                    updateCommentCallback(e.target.value);
                };
                // Bind actions to tooltip color buttons
                var colorButtons = _this.tooltip.getElementsByClassName(CLASS_COLOR_BUTTON);
                var _loop_1 = function (i) {
                    var button = colorButtons[i];
                    button.onclick = function () {
                        var idx = parseInt(button.getAttribute(COLOR_ATTRIBUTE));
                        var newColor = _this.colors[idx] ||
                            _this.colors[FALLBACK_COLOR_IDX] ||
                            FALLBACK_COLOR;
                        selectColorCallback(newColor);
                    };
                };
                for (var i = 0; i < colorButtons.length; i++) {
                    _loop_1(i);
                }
            };
            this.colors = colors;
            this.tooltip = document.getElementById(ID_TOOLTIP);
            this.addDeleteButton();
            this.addCommentArea();
            this.addColorButtons();
        }
        return TooltipManager;
    }());
    var NavigatorManager = /** @class */ (function () {
        function NavigatorManager(colors) {
            var _this = this;
            // Methods that manipulate the DOM:
            this.update = function (sortedAnnotations, annotationDetails) {
                var prevScrollTop = _this.scrollTop();
                _this.navigator.replaceChildren();
                var filter = _this.colorFilter(sortedAnnotations, annotationDetails);
                _this.navigator.appendChild(filter);
                var cards = _this.annotationCards(sortedAnnotations, annotationDetails);
                _this.navigator.appendChild(cards);
                cards.scrollTop = prevScrollTop;
            };
            this.colorFilter = function (sortedAnnotations, annotationDetails) {
                var colorFilter = document.createElement("div");
                colorFilter.className = NavigatorManager.CLASS_COLOR_ROW;
                var uniqueColors = new Set();
                for (var id in annotationDetails) {
                    var annotation = annotationDetails[id];
                    uniqueColors.add(annotation.highlightColor);
                }
                var sortedColors = __spreadArray(__spreadArray([], _this.colors.filter(function (color) { return uniqueColors.has(color); }), true), Array.from(uniqueColors)
                    .filter(function (color) { return !_this.colors.includes(color); })
                    .sort(), true);
                sortedColors.forEach(function (color) {
                    var colorButton = document.createElement("button");
                    colorButton.className = NavigatorManager.CLASS_COLOR_BUTTON;
                    colorButton.style.backgroundColor = color;
                    if (_this.filterColor === color) {
                        colorButton.style.border = "2px solid gray";
                    }
                    colorButton.onclick = function () {
                        if (_this.filterColor === color) {
                            _this.filterColor = null;
                        }
                        else {
                            _this.filterColor = color;
                        }
                        _this.update(sortedAnnotations, annotationDetails);
                    };
                    colorFilter.appendChild(colorButton);
                });
                return colorFilter;
            };
            this.annotationCards = function (sortedAnnotations, annotationDetails) {
                var cards = document.createElement("div");
                cards.id = NavigatorManager.CLASS_NAVIGATOR_CARDS;
                cards.style.overflow = "auto";
                var _loop_2 = function (i) {
                    var annotationElement = sortedAnnotations[i];
                    var id = annotationElement.getAttribute(ATTRIBUTE_ANNOTATION_ID);
                    if (_this.filterColor &&
                        annotationDetails[id].highlightColor !== _this.filterColor) {
                        return "continue";
                    }
                    var _a = annotationDetails[id], comment = _a.comment, highlightedString = _a.highlightedString, highlightColor = _a.highlightColor;
                    var card = document.createElement("div");
                    card.style.backgroundColor = highlightColor;
                    card.className = NavigatorManager.CLASS_NAVIGATOR_CARD;
                    if (comment) {
                        card.innerText = comment.substring(0, 20);
                    }
                    else if (highlightedString.match(/\s+/)) {
                        card.innerText = "empty";
                        card.style.fontStyle = "italic";
                    }
                    else {
                        card.innerText = highlightedString;
                    }
                    card.onclick = function () {
                        return annotationElement.scrollIntoView({
                            behavior: "smooth",
                            block: "center"
                        });
                    };
                    cards.appendChild(card);
                };
                for (var i = 0; i < sortedAnnotations.length; i++) {
                    _loop_2(i);
                }
                return cards;
            };
            this.scrollTop = function () {
                var prevCards = document.getElementById(NavigatorManager.CLASS_NAVIGATOR_CARDS);
                return prevCards ? prevCards.scrollTop : 0;
            };
            this.insertToggleNavigatorIntoDOM = function () {
                var navigator = document.createElement("div");
                navigator.id = NavigatorManager.ID_NAVIGATOR;
                // navigator.onclick = () => {
                //   navigator.style.visibility = "hidden";
                //   toggle.style.visibility = "visible";
                // };
                var toggle = document.createElement("div");
                toggle.id = NavigatorManager.ID_TOGGLE;
                toggle.textContent = "a";
                toggle.onclick = function () {
                    navigator.style.visibility = "visible";
                    toggle.style.visibility = "hidden";
                };
                document.body.appendChild(navigator);
                document.body.appendChild(toggle);
                return { navigator: navigator, toggle: toggle };
            };
            this.wasClicked = function (target) {
                return _this.toggle.contains(target) || _this.navigator.contains(target);
            };
            var _a = this.insertToggleNavigatorIntoDOM(), navigator = _a.navigator, toggle = _a.toggle;
            this.colors = colors;
            this.navigator = navigator;
            this.toggle = toggle;
        }
        NavigatorManager.ID_NAVIGATOR = "__annotate-navigator__";
        NavigatorManager.ID_TOGGLE = "__annotate-toggle__";
        NavigatorManager.CLASS_NAVIGATOR_CARD = "__annotate-navigator__card__";
        NavigatorManager.CLASS_NAVIGATOR_CARDS = "__annotate-navigator__cards__";
        NavigatorManager.CLASS_COLOR_ROW = "__annotate-filter__";
        NavigatorManager.CLASS_COLOR_BUTTON = "__annotate-filter-color__";
        return NavigatorManager;
    }());
    var Annotate = /** @class */ (function () {
        function Annotate(colors, showNavigator) {
            var _this = this;
            this.handleSelection = function (event) {
                var _a;
                var selection = window.getSelection();
                var anchorNode = selection.anchorNode, focusNode = selection.focusNode;
                var target = event.target;
                var clickedNavigator = (_a = _this.navigatorManager) === null || _a === void 0 ? void 0 : _a.wasClicked(target);
                if (clickedNavigator) {
                    return;
                }
                var tooltip = document.getElementById(ID_TOOLTIP);
                var clickedTooltip = tooltip && tooltip.contains(target);
                if (!clickedTooltip) {
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
            this.navigatorManager = showNavigator
                ? new NavigatorManager(colors)
                : null;
            this.annotationManager = new AnnotationManager(colors, this.navigatorManager);
            document.addEventListener("mouseup", this.handleSelection);
        }
        return Annotate;
    }());
    // Make Annotate globally accessible
    window["Annotate"] = window["Annotate"] || Annotate;
})(window, window.document);
// - closing sidebar
// - color picking - allow the end users to select their own highlight color using a color picker
// - webpage
// - store annotation IDs in a separate entry in local storage to prevent parsing everything - local storage manager???
// future considerations:
// - cleaner files
// -> move CSS to TS
// -> separate files
// -> compile into a single js file in a separate directory
// - improve UX:
//    -> animations
//    -> freeze selection, make it stay as long as tooltip is open?
//    -> make sure the tooltip appears at the start of the selection -> get the smaller x coordinate of mouseup vs. mousedown
// - cleanup
// -> stop working with regex and use text instead? implement in parallel before removing regex!
// - extend API - add callbacks? annotation created, changed, ...
// - selection across nodes
//    -> would need a regex that can match words across nodes (probably - depends on the string returned by selection in case the selection is multi-node)
//    -> another problem: span layering -> how to handle what was clicked? What if a highlight is immersed in a large highlight? we'd need to make sure its event listener gets fired
