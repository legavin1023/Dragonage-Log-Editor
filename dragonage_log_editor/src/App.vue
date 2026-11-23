<template><router-view /></template>
<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: #11151c;
  color: #e9edf5;
}
body,
button,
input,
textarea {
  font-family: "Malgun Gothic", sans-serif;
  font-size: 14px;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid #dfb76c;
  outline-offset: 3px;
}
</style>
