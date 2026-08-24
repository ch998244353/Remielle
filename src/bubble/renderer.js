const plainText = document.getElementById('plain-text');
const projectMessage = document.getElementById('project-message');
const sourceName = document.getElementById('source-name');
const projectName = document.getElementById('project-name');
const messageDetail = document.getElementById('message-detail');

globalThis.bubbleApi.onUpdate((message) => {
  document.body.dataset.side = message.side;
  document.body.dataset.mode = message.mode;
  plainText.hidden = message.mode !== 'plain';
  projectMessage.hidden = message.mode !== 'project';
  if (message.mode === 'plain') {
    plainText.textContent = message.text;
    return;
  }
  sourceName.textContent = message.source === 'deepseek' ? 'DeepSeek' : 'Codex';
  projectName.textContent = message.projectName;
  messageDetail.textContent = message.detail;
  messageDetail.scrollTop = 0;
});

messageDetail.addEventListener('wheel', (event) => {
  if (messageDetail.scrollHeight <= messageDetail.clientHeight) return;
  event.preventDefault();
  const page = Math.round(messageDetail.scrollTop / messageDetail.clientHeight);
  const lastPage = Math.ceil((messageDetail.scrollHeight - messageDetail.clientHeight) / messageDetail.clientHeight);
  const nextPage = Math.max(0, Math.min(lastPage, page + Math.sign(event.deltaY)));
  if (nextPage === page) return;
  messageDetail.scrollTo({ top: nextPage * messageDetail.clientHeight, behavior: 'smooth' });
  globalThis.bubbleApi.reportPageChange();
}, { passive: false });
