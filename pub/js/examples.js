// Configure parts of the library
const colors = [
  "#FFADAD",
  "#FFD6A5",
  "#FDFFB6",
  "#CAFFBF",
  "#A0C4FF",
  "#BDB2FF",
];

const showNavigator = true;

new Annotate(colors, showNavigator);

// Add dummy highlights
const dummyHighlights = {
  "825706e58622":
    '{"path":[["body",0],["ol",0],["ol",0],["li",4]],"comment":"For example this one","highlightedString":"an annotation","regex":{},"encodedRegex":"an(%5Cs%2B)annotation","pos":0,"highlightColor":"#FDFFB6","id":"825706e58622"}',
  "24647cef93f2":
    '{"path":[["body",0],["p",0]],"comment":"Wow!","highlightedString":"persist across sessions","regex":{},"encodedRegex":"persist(%5Cs%2B)across(%5Cs%2B)sessions","pos":0,"highlightColor":"#CAFFBF","id":"24647cef93f2"}',
  "0405215e3c7a": `{"path":[["body",0],["p",0]],"comment":"That's cool!","highlightedString":"can be easily navigated using the annotate.js navigator component","regex":{},"encodedRegex":"can(%5Cs%2B)be(%5Cs%2B)easily(%5Cs%2B)navigated(%5Cs%2B)using(%5Cs%2B)the(%5Cs%2B)annotate.js(%5Cs%2B)navigator(%5Cs%2B)component","pos":0,"highlightColor":"#FFADAD","id":"0405215e3c7a"}`,
  b4bdfe3d3a3b:
    '{"path":[["body",0],["div",3],["p",0]],"comment":"I am a sample annotation for a long text","highlightedString":"Vivamus magna lacus, laoreet quis erat sed, semper ultrices metus. In ac dolor non lacus pellentesque finibus.","regex":{},"encodedRegex":"Vivamus(%5Cs%2B)magna(%5Cs%2B)lacus%2C(%5Cs%2B)laoreet(%5Cs%2B)quis(%5Cs%2B)erat(%5Cs%2B)sed%2C(%5Cs%2B)semper(%5Cs%2B)ultrices(%5Cs%2B)metus.(%5Cs%2B)In(%5Cs%2B)ac(%5Cs%2B)dolor(%5Cs%2B)non(%5Cs%2B)lacus(%5Cs%2B)pellentesque(%5Cs%2B)finibus.","pos":0,"highlightColor":"#BDB2FF","id":"b4bdfe3d3a3b"}',
};

if (window.localStorage.length === 0) {
  for (const key in dummyHighlights) {
    window.localStorage.setItem(key, dummyHighlights[key]);
  }
}
