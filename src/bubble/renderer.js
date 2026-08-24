const text = document.getElementById('text');

globalThis.bubbleApi.onUpdate((message) => {
  text.textContent = message.text;
  document.body.dataset.side = message.side;
});
