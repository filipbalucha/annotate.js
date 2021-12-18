# js-library-baluchaf

* [Landing page](https://annotatejs.herokuapp.com/)

* [Documentation](https://annotatejs.herokuapp.com/api.html)

## Getting started

To add annotate.js to your library, simply add the following to your JavaScript file:
    
```html
<script defer type="text/javascript" src="http://annotatejs.herokuapp.com/js/annotate/annotate.js"></script>
<link rel="stylesheet" href="http://annotatejs.herokuapp.com/js/annotate/annotate.css"/>
```
Then, initialize annotate.js in a JavaScript file as follows:
```javascript
// Define as many colors as you like
const colors = [ "#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF", "#A0C4FF", "#BDB2FF" ];
        
// Decide if the navigator element should be visible
const showNavigator = true;
        
new Annotate(colors, showNavigator);
```
This will make the annotate.js tooltip appear on text selection. Based on your preference, it will make the toggle and navigator appear in the bottom right corner of your web page.