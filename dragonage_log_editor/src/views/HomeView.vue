<template>
  <div class="editor">
    <header class="toolbar">
      <div class="brand">
        <span class="brand-icon">D</span>
        <div>
          <h1>Dragonage Log Editor</h1>
          <p>이야기 사이에, GM의 한마디.</p>
        </div>
      </div>
      <div class="file-actions">
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept=".html,.htm,text/html"
          @change="openFile"
        />
        <button @click="$refs.fileInput.click()">HTML 불러오기</button>
        <button class="primary" :disabled="!ready" @click="download">
          HTML 저장<span v-if="dirty"> ·</span>
        </button>
      </div>
    </header>
    <div class="workspace">
      <main class="preview-panel">
        <div class="preview-heading">
          <span>{{ fileName || "채팅 로그" }}</span
          ><span>{{
            loaded ? `${groupCount}개 메시지 그룹` : "HTML LOG"
          }}</span>
        </div>
        <iframe
          v-if="loaded"
          ref="preview"
          title="채팅 로그 미리보기 · 메시지 그룹을 선택하세요"
          sandbox="allow-same-origin"
          :srcdoc="source"
          @load="connectPreview"
        />
        <div v-else class="empty-state">
          <span class="empty-symbol">✦</span>
          <p class="eyebrow">THE STORY CONTINUES</p>
          <h2>대화와 대화 사이,<br />이야기를 이어 주세요.</h2>
          <p>
            TRPG 채팅 로그의 대화를 선택하고<br />그 바로 뒤에 GM의 묘사와
            대사를 추가하세요.
          </p>
          <button class="primary" @click="$refs.fileInput.click()">
            HTML 파일 선택
          </button>
        </div>
      </main>
      <aside class="composer">
        <div class="section-title">
          <span class="eyebrow">GAME MASTER</span>
          <h2>GM 메시지 추가</h2>
          <p>왼쪽 대화를 누르면 삽입할 위치가 선택됩니다.</p>
        </div>
        <div class="selection" :class="{ active: selected }">
          <span class="field-label">삽입 위치</span
          ><template v-if="selected"
            ><strong>{{ selectionLabel }} 다음</strong>
            <p>{{ selectionExcerpt }}</p></template
          >
          <p v-else>아직 선택한 대화가 없어요.</p>
        </div>
        <form @submit.prevent="insertMessage">
          <label for="author">GM 이름</label
          ><input
            id="author"
            v-model="author"
            list="authors"
            maxlength="100"
            placeholder="게임 마스터"
          />
          <datalist id="authors">
            <option v-for="name in authors" :key="name" :value="name" />
          </datalist>
          <p class="field-help">
            로그에 있는 이름을 쓰면 해당 인물의 초상화와 색상을 사용합니다.
          </p>
          <label for="gm-text">묘사 또는 대사</label>
          <textarea
            id="gm-text"
            ref="messageInput"
            v-model="draft"
            rows="8"
            placeholder="문이 천천히 열리고, 차가운 바람이 일행의 곁을 스칩니다…"
            @keydown.ctrl.enter.prevent="insertMessage"
            @keydown.meta.enter.prevent="insertMessage"
          />
          <div class="text-meta">
            <span>줄바꿈이 그대로 반영됩니다.</span
            ><span>{{ draft.length }}자</span>
          </div>
          <button
            class="primary insert-button"
            :disabled="!selected || !draft.trim() || !author.trim()"
            type="submit"
          >
            선택한 대화 뒤에 추가
          </button>
          <p class="shortcut">Ctrl / ⌘ + Enter로 빠르게 추가</p>
        </form>
        <div v-if="selectedAdded" class="edit-actions">
          <button @click="loadSelectedText">선택한 GM 내용 불러오기</button
          ><button
            :disabled="!draft.trim() || !author.trim()"
            @click="updateMessage"
          >
            수정 적용</button
          ><button class="danger" @click="deleteMessage">삭제</button>
        </div>
        <div class="session-info">
          <span
            >이번 편집 <strong>{{ historyCount }}</strong
            >회</span
          ><button :disabled="!historyCount" @click="undo">되돌리기</button>
        </div>
        <p class="notice" role="status" aria-live="polite">{{ notice }}</p>
        <p class="privacy-note">
          파일은 이 브라우저에서 편집됩니다.<br />작업을 마치면 HTML 저장을 눌러
          주세요.
        </p>
      </aside>
    </div>
  </div>
</template>
<script>
import { markRaw } from "vue";
import {
  GROUP,
  parseLog,
  getAuthors,
  createGmMessage,
  serializeLog,
} from "../lib/logDocument";
export default {
  name: "HomeView",
  data: () => ({
    source: "",
    loaded: false,
    ready: false,
    busy: false,
    fileName: "",
    selected: null,
    selectionLabel: "",
    selectionExcerpt: "",
    selectedAdded: false,
    author: "게임 마스터",
    authors: [],
    draft: "",
    groupCount: 0,
    history: [],
    historyCount: 0,
    dirty: false,
    notice: "",
    loadVersion: 0,
  }),
  mounted() {
    window.addEventListener("beforeunload", this.beforeUnload);
  },
  beforeUnmount() {
    window.removeEventListener("beforeunload", this.beforeUnload);
  },
  methods: {
    beforeUnload(event) {
      if (this.dirty || this.draft.trim()) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    canReplace() {
      return (
        !(this.dirty || this.draft.trim()) ||
        window.confirm(
          "저장하지 않은 편집 내용이 있습니다. 다른 로그를 열까요?",
        )
      );
    },
    async openFile(event) {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file || !this.canReplace()) return;
      const version = ++this.loadVersion;
      try {
        const html = await file.text();
        if (version === this.loadVersion) this.loadLog(html, file.name);
      } catch (error) {
        this.notice = `파일을 열지 못했습니다. ${error.message}`;
      }
    },
    async loadSample() {
      if (!this.canReplace()) return;
      const version = ++this.loadVersion;
      this.busy = true;
      try {
        const response = await fetch(`${process.env.BASE_URL}sample-log.html`);
        if (!response.ok) throw new Error("샘플 로그를 불러오지 못했습니다.");
        const html = await response.text();
        if (version === this.loadVersion)
          this.loadLog(
            html,
            "협죽도의 아가리 (네스토르의 고통) (2026-11-23).html",
          );
      } catch (error) {
        this.notice = error.message;
      } finally {
        this.busy = false;
      }
    },
    loadLog(html, name) {
      const doc = parseLog(html);
      this.authors = getAuthors(doc);
      this.author =
        this.authors.find((name) =>
          /게임\s*마스터|^gm$|^마스터$/i.test(name),
        ) || "게임 마스터";
      this.clearSelection();
      this.history = [];
      this.historyCount = 0;
      this.dirty = false;
      this.draft = "";
      this.fileName = name;
      this.groupCount = doc.querySelectorAll(GROUP).length;
      this.ready = false;
      // A new srcdoc value also reloads an unchanged file when reopened.
      this.source =
        "<!DOCTYPE html>\n" +
        doc.documentElement.outerHTML +
        `\n<!-- editor-load-${this.loadVersion} -->`;
      this.loaded = true;
      this.notice = "대화를 선택하면 바로 뒤에 GM 메시지를 추가할 수 있습니다.";
    },
    connectPreview() {
      const doc = this.$refs.preview.contentDocument;
      const style = doc.createElement("style");
      style.dataset.logEditorStyle = "true";
      style.textContent = `${GROUP}{cursor:pointer} ${GROUP}:hover{outline:2px solid #d8b977;outline-offset:2px} [data-log-editor-selected]{outline:3px solid #ffcf78!important;outline-offset:3px}`;
      doc.head.append(style);
      doc.addEventListener("click", (event) => {
        event.preventDefault();
        const group = event.target.closest(GROUP);
        if (group) this.selectGroup(group);
      });
      doc.querySelectorAll(GROUP).forEach((group) => {
        if (!group.hasAttribute("tabindex")) {
          group.tabIndex = 0;
          group.dataset.logEditorTab = "true";
        }
      });
      doc.addEventListener("keydown", (event) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          event.target.matches(GROUP)
        ) {
          event.preventDefault();
          this.selectGroup(event.target);
          this.$refs.messageInput.focus();
        }
      });
      this.ready = true;
    },
    selectGroup(group) {
      this.selected?.removeAttribute("data-log-editor-selected");
      this.selected = markRaw(group);
      group.dataset.logEditorSelected = "true";
      const groups = [...group.ownerDocument.querySelectorAll(GROUP)];
      this.selectionLabel = `#${groups.indexOf(group) + 1} · ${
        group.querySelector(".chatlog__author-name")?.textContent || "대화"
      }`;
      this.selectionExcerpt = (
        group.querySelector(".chatlog__content")?.textContent || ""
      )
        .trim()
        .slice(0, 160);
      this.selectedAdded = group.dataset.gmEntry === "true";
    },
    clearSelection() {
      this.selected?.removeAttribute("data-log-editor-selected");
      this.selected = null;
      this.selectedAdded = false;
    },
    record(action) {
      this.history.push(markRaw(action));
      this.historyCount = this.history.length;
      this.dirty = true;
    },
    newMessage() {
      const group = createGmMessage(
        this.selected.ownerDocument,
        this.author.trim(),
        this.draft,
      );
      group.tabIndex = 0;
      group.dataset.logEditorTab = "true";
      return group;
    },
    insertMessage() {
      if (!this.selected || !this.draft.trim() || !this.author.trim()) return;
      const group = this.newMessage();
      this.record({ type: "insert", group, anchor: this.selected });
      this.selected.after(group);
      this.groupCount++;
      this.selectGroup(group);
      group.scrollIntoView({ behavior: "smooth", block: "center" });
      this.draft = "";
      this.notice =
        "GM 메시지를 추가했습니다. 이 메시지 뒤에 이어서 추가할 수도 있습니다.";
    },
    loadSelectedText() {
      if (
        !this.selectedAdded ||
        (this.draft.trim() &&
          !window.confirm("입력 중인 내용을 선택한 GM 메시지로 바꿀까요?"))
      )
        return;
      this.author = this.selected.querySelector(
        ".chatlog__author-name",
      ).textContent;
      this.draft = this.selected.querySelector(
        ".preserve-whitespace",
      ).textContent;
      this.$refs.messageInput.focus();
    },
    updateMessage() {
      if (!this.selectedAdded || !this.draft.trim() || !this.author.trim())
        return;
      const old = this.selected;
      const group = this.newMessage();
      this.record({ type: "update", group, old });
      old.replaceWith(group);
      this.selectGroup(group);
      this.draft = "";
      this.notice = "GM 메시지를 수정했습니다.";
    },
    deleteMessage() {
      if (!this.selectedAdded) return;
      const group = this.selected;
      this.record({
        type: "delete",
        group,
        parent: group.parentNode,
        next: group.nextSibling,
      });
      this.clearSelection();
      group.remove();
      this.groupCount--;
      this.notice = "GM 메시지를 삭제했습니다. 되돌리기로 복원할 수 있습니다.";
    },
    undo() {
      const action = this.history.pop();
      if (!action) return;
      this.clearSelection();
      if (action.type === "insert") {
        action.group.remove();
        this.groupCount--;
        if (action.anchor.isConnected) this.selectGroup(action.anchor);
      }
      if (action.type === "update") {
        action.group.replaceWith(action.old);
        this.selectGroup(action.old);
      }
      if (action.type === "delete") {
        action.parent.insertBefore(action.group, action.next);
        this.groupCount++;
        this.selectGroup(action.group);
      }
      this.historyCount = this.history.length;
      this.dirty = true;
      this.notice = "마지막 편집을 되돌렸습니다.";
    },
    download() {
      const doc = this.$refs.preview?.contentDocument;
      if (!doc || !this.ready) return;
      const url = URL.createObjectURL(
        new Blob([serializeLog(doc)], { type: "text/html;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = this.fileName.replace(/\.html?$/i, "") + "_편집본.html";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.dirty = false;
      this.notice = this.draft.trim()
        ? "HTML을 저장했습니다. 아직 추가하지 않은 입력 내용은 저장에 포함되지 않습니다."
        : "편집한 HTML을 저장했습니다.";
    },
  },
};
</script>
<style scoped>
.editor {
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.toolbar {
  min-height: 90px;
  padding: 18px 28px;
  border-bottom: 1px solid #303641;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: #191e27;
}
.brand {
  display: flex;
  gap: 14px;
  align-items: center;
}
.brand-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 46px;
  border: 1px solid #c59d59;
  color: #e1bb77;
  font-family: Georgia, serif;
  font-size: 28px;
}
h1 {
  font-family: Georgia, serif;
  font-size: 22px;
  font-weight: 400;
  margin: 0 0 5px;
}
.brand p {
  margin: 0;
  color: #a5aebd;
  font-size: 13px;
}
button {
  border: 1px solid #49515f;
  background: #252c38;
  color: #e9edf5;
  padding: 11px 16px;
  border-radius: 6px;
}
button:hover:enabled {
  filter: brightness(1.15);
}
.primary {
  color: #221b10;
  background: #d9b474;
  border-color: #d9b474;
  font-weight: 700;
}
.file-actions {
  display: flex;
  gap: 10px;
}
.hidden {
  display: none;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  flex: 1;
  min-height: 0;
}
.preview-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.preview-heading {
  min-height: 48px;
  padding: 15px 24px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  color: #a5aebd;
  font-size: 13px;
  border-bottom: 1px solid #2a303b;
}
.preview-heading span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-heading span:last-child {
  flex-shrink: 0;
}
iframe {
  width: 100%;
  flex: 1;
  min-height: 0;
  border: 0;
  background: #202020;
}
.composer {
  padding: 28px 24px;
  border-left: 1px solid #303641;
  background: #191e27;
  overflow-y: auto;
}
.eyebrow {
  letter-spacing: 2px;
  color: #d6b477;
  font-size: 12px;
}
h2 {
  font-size: 22px;
  margin: 9px 0 12px;
}
.section-title p,
.selection p,
.field-help {
  color: #a6afbf;
  line-height: 1.7;
}
.section-title p {
  margin-bottom: 24px;
}
.selection {
  border: 1px dashed #49515f;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 25px;
}
.selection.active {
  border: 1px solid #9f814d;
  background: #27272a;
}
.field-label {
  display: block;
  color: #aeb5c1;
  font-size: 12px;
  margin-bottom: 9px;
}
.selection strong {
  font-size: 14px;
}
.selection p {
  margin: 7px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  max-height: 95px;
  overflow: auto;
}
label {
  display: block;
  margin: 19px 0 10px;
  font-weight: bold;
}
input,
textarea {
  width: 100%;
  background: #11161e;
  color: #e9edf5;
  border: 1px solid #424b59;
  border-radius: 6px;
  padding: 12px;
}
textarea {
  resize: vertical;
  line-height: 1.8;
  font-size: 15px;
  min-height: 145px;
}
input::placeholder,
textarea::placeholder {
  color: #7e899a;
}
.field-help {
  font-size: 12px;
  margin-top: 8px;
}
.text-meta {
  display: flex;
  justify-content: space-between;
  color: #969faf;
  font-size: 12px;
  margin: 8px 0 20px;
}
.insert-button {
  width: 100%;
}
.shortcut {
  color: #969faf;
  font-size: 12px;
  text-align: center;
}
.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
.edit-actions button {
  font-size: 12px;
  padding: 10px;
}
.danger {
  color: #f2aaa5;
}
.session-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #353c48;
  padding-top: 23px;
  margin-top: 28px;
  color: #a6afbf;
  font-size: 12px;
}
.session-info strong {
  color: #e1bb77;
}
.session-info button {
  font-size: 12px;
  padding: 8px;
}
.notice {
  font-size: 13px;
  line-height: 1.7;
  color: #e1bb77;
}
.privacy-note {
  font-size: 12px;
  line-height: 1.8;
  color: #929cac;
  margin-top: 25px;
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  background: radial-gradient(ellipse at 50% 40%, #242936 0%, #11151c 65%);
}
.empty-symbol {
  color: #d9b474;
  font-size: 50px;
  margin-bottom: 20px;
}
.empty-state h2 {
  font-size: clamp(26px, 3vw, 38px);
  font-weight: 400;
  line-height: 1.5;
}
.empty-state > p:not(.eyebrow) {
  color: #a6afbf;
  font-size: 15px;
  line-height: 1.9;
  margin-bottom: 30px;
}
.sample-button {
  border: 0;
  background: transparent;
  color: #d9b474;
  margin-top: 12px;
}
@media (max-width: 850px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr) 310px;
  }
  .composer {
    padding: 22px 18px;
  }
  .toolbar {
    padding: 15px;
  }
  h1 {
    font-size: 18px;
  }
  .brand-icon {
    display: none;
  }
}
@media (max-width: 650px) {
  .editor {
    height: auto;
    min-height: 100dvh;
  }
  .toolbar {
    flex-wrap: wrap;
    gap: 15px;
  }
  .workspace {
    display: flex;
    flex-direction: column;
  }
  .preview-panel {
    height: 62dvh;
    min-height: 380px;
  }
  .composer {
    border-left: 0;
    border-top: 1px solid #303641;
    overflow: visible;
  }
  .empty-symbol {
    display: none;
  }
  .empty-state {
    padding: 20px;
  }
  .empty-state h2 {
    font-size: 24px;
  }
  .empty-state > p:not(.eyebrow) {
    margin-bottom: 14px;
  }
}
</style>
