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
const useCase1 = `{"path":[["body",0],["p",1]],"highlightedString":"capture their thoughts","regex":{},"encodedRegex":"capture(%5Cs%2B)their(%5Cs%2B)thoughts","pos":0,"highlightColor":"#CAFFBF","id":"4ccc06a20e30","comment":"That's really impressive!"}`;
const useCase2 =
  '{"path":[["body",0],["p",1]],"highlightedString":"growing content","regex":{},"encodedRegex":"growing(%5Cs%2B)content","pos":0,"highlightColor":"#FFADAD","id":"c0ad81cf7081","comment":"Finally someone did this!"}';
const useCase3 = `{"path":[["body",0],["p",1]],"highlightedString":"navigate long texts","regex":{},"encodedRegex":"navigate(%5Cs%2B)long(%5Cs%2B)texts","pos":0,"highlightColor":"#FFD6A5","id":"4c4c0d4c1c12","comment":"That's neat"}`;
if (window.localStorage.length === 0) {
  window.localStorage.setItem("4ccc06a20e30", useCase1);
  window.localStorage.setItem("c0ad81cf7081", useCase2);
  window.localStorage.setItem("4c4c0d4c1c12", useCase3);
}

// Simulate growing content
const paragraph =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla vestibulum, mi eget vehicula sollicitudin, ex lacus vestibulum nibh, quis dignissim purus metus vitae orci. Donec ultricies cursus fringilla. Etiam at lacus ullamcorper, pulvinar dolor vel, convallis risus. Nullam condimentum condimentum euismod. Quisque blandit, dolor sed lobortis bibendum, nunc mauris feugiat turpis, sit amet suscipit est leo eget quam. Sed sit amet aliquet massa. Pellentesque commodo erat eget nisl aliquet, et ultricies tellus mollis. Aliquam pulvinar odio libero, ac vestibulum nibh auctor ac. Cras eu finibus ipsum. Nulla rhoncus rutrum congue. Donec non augue mollis, vulputate est et, porttitor quam. Morbi orci turpis, tempus ac sodales vitae, hendrerit id lacus. Nulla pharetra tincidunt tortor, in tincidunt felis auctor sed.";
const sentences = paragraph.split(". ");

let sentIdx = 0;
const insertRow = () => {
  const table = document.getElementById("growing-table");
  const newRow = table.insertRow();
  const cellLeft = newRow.insertCell();
  const cellRight = newRow.insertCell();
  cellLeft.innerHTML = sentences[sentIdx % sentences.length] + ".";
  cellRight.innerHTML = sentences[sentIdx % sentences.length] + ".";
  sentIdx++;
};
