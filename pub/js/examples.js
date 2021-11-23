// Configure parts of the library
const colors = [
  "#FFADAD",
  "#FFD6A5",
  "#FDFFB6",
  "#CAFFBF",
  "#A0C4FF",
  "#BDB2FF",
];

new Annotate(colors);

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
