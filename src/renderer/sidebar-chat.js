/* =========================================================
   Sidebar AI Chat — Minimal flow-aware controller
   - Pure DOM module, no framework needed.
   - Renders UI into a given mount element and exposes
     a small API for sending / streaming responses.
   ========================================================= */

(function (global) {
  "use strict";

  const FLOW_STEPS = [
    { key: "input",    label: "入力" },
    { key: "send",     label: "送信" },
    { key: "thinking", label: "AI 思考中" },
    { key: "answer",   label: "回答" },
  ];

  const STATUS = {
    idle:     { label: "待機中",     cls: "" },
    typing:   { label: "入力中",     cls: "" },
    sending:  { label: "送信中…",    cls: "is-thinking" },
    thinking: { label: "AI 思考中…", cls: "is-thinking" },
    done:     { label: "完了",       cls: "is-done" },
    error:    { label: "エラー",     cls: "is-error" },
  };

  const SUGGESTIONS = [
    "このプロジェクトの概要を要約して",
    "選択中のコードをリファクタリングして",
    "エラーログから原因を推測して",
  ];

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  };

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== undefined && v !== null) {
        node.setAttribute(k, v);
      }
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fmtTime(d = new Date()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  class SidebarChat {
    /**
     * @param {HTMLElement} mount
     * @param {{ onSend?: (text:string, ctx:{push:Function, done:Function, fail:Function})=>void }} opts
     */
    constructor(mount, opts = {}) {
      this.mount = mount;
      this.opts = opts;
      this.messages = [];
      this.flowIndex = 0; // 0..3
      this.status = "idle";
      this.aborted = false;
      this._render();
    }

    /* ---------- Public API ---------- */
    setStatus(key) {
      if (!STATUS[key]) return;
      this.status = key;
      this._renderStatus();
    }

    setFlow(index) {
      this.flowIndex = Math.max(0, Math.min(FLOW_STEPS.length - 1, index));
      this._renderFlow();
    }

    pushMessage(role, content, { streaming = false } = {}) {
      const msg = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role,
        content,
        time: fmtTime(),
        streaming,
      };
      this.messages.push(msg);
      this._renderMessages();
      this._scrollToBottom();
      return msg.id;
    }

    appendToMessage(id, chunk) {
      const m = this.messages.find((x) => x.id === id);
      if (!m) return;
      m.content += chunk;
      const node = this._messagesEl.querySelector(`[data-id="${id}"] .sc-msg__body`);
      if (node) node.textContent = m.content;
      this._scrollToBottom();
    }

    finalizeMessage(id) {
      const m = this.messages.find((x) => x.id === id);
      if (!m) return;
      m.streaming = false;
      this._renderMessages();
    }

    clear() {
      this.messages = [];
      this.setFlow(0);
      this.setStatus("idle");
      this._renderMessages();
    }

    /* ---------- Render ---------- */
    _render() {
      this.mount.classList.add("sc-sidebar");
      this.mount.innerHTML = "";

      // Header
      this.mount.appendChild(
        el("div", { class: "sc-header" }, [
          el("div", { class: "sc-header__title" }, [
            el("span", { class: "sc-dot" }),
            "AI アシスタント",
          ]),
          el("div", { class: "sc-header__actions" }, [
            el("button", {
              class: "sc-iconbtn",
              title: "新しいチャット",
              "aria-label": "新しいチャット",
              html: ICONS.plus,
              onclick: () => this.clear(),
            }),
            el("button", {
              class: "sc-iconbtn",
              title: "履歴をクリア",
              "aria-label": "履歴をクリア",
              html: ICONS.trash,
              onclick: () => this.clear(),
            }),
          ]),
        ])
      );

      // Flow stepper
      this._flowEl = el("div", { class: "sc-flow" });
      this.mount.appendChild(this._flowEl);
      this._renderFlow();

      // Status bar
      this._statusEl = el("div", { class: "sc-status" });
      this.mount.appendChild(this._statusEl);
      this._renderStatus();

      // Messages
      this._messagesEl = el("div", { class: "sc-messages" });
      this.mount.appendChild(this._messagesEl);
      this._renderMessages();

      // Composer
      const textarea = el("textarea", {
        class: "sc-composer__textarea",
        rows: "1",
        placeholder: "メッセージを入力 ( Shift + Enter で改行 )",
      });
      const sendBtn = el("button", {
        class: "sc-send",
        type: "button",
        title: "送信",
        "aria-label": "送信",
        html: ICONS.send,
      });

      const updateSendDisabled = () => {
        sendBtn.disabled =
          textarea.value.trim().length === 0 || this.status === "thinking";
      };

      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
        if (this.status === "idle" || this.status === "done") {
          this.setStatus("typing");
          this.setFlow(0);
        }
        updateSendDisabled();
      });

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          if (!sendBtn.disabled) this._handleSend(textarea);
        }
      });

      sendBtn.addEventListener("click", () => this._handleSend(textarea));

      const stopBtn = el("button", {
        class: "sc-textbtn",
        type: "button",
        title: "応答を停止",
      }, "停止");
      stopBtn.addEventListener("click", () => {
        this.aborted = true;
        this.setStatus("done");
        this.setFlow(3);
      });

      const regenBtn = el("button", {
        class: "sc-textbtn",
        type: "button",
        title: "最後の応答を再生成",
      }, "再生成");
      regenBtn.addEventListener("click", () => {
        const lastUser = [...this.messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          textarea.value = lastUser.content;
          textarea.dispatchEvent(new Event("input"));
          this._handleSend(textarea);
        }
      });

      const clearBtn = el("button", {
        class: "sc-textbtn",
        type: "button",
        title: "履歴をクリア",
      }, "クリア");
      clearBtn.addEventListener("click", () => this.clear());

      this.mount.appendChild(
        el("div", { class: "sc-composer" }, [
          el("div", { class: "sc-composer__box" }, [textarea, sendBtn]),
          el("div", { class: "sc-composer__hint" }, [
            el("div", {}, [
              el("span", { class: "sc-kbd" }, "Enter"),
              " 送信 / ",
              el("span", { class: "sc-kbd" }, "Shift+Enter"),
              " 改行",
            ]),
            el("div", { class: "sc-composer__actions" }, [
              stopBtn, regenBtn, clearBtn,
            ]),
          ]),
        ])
      );

      this._textarea = textarea;
      this._sendBtn = sendBtn;
      updateSendDisabled();
    }

    _renderFlow() {
      this._flowEl.innerHTML = "";
      FLOW_STEPS.forEach((s, i) => {
        const cls =
          "sc-flow__step" +
          (i < this.flowIndex ? " is-done" : "") +
          (i === this.flowIndex ? " is-active" : "");
        this._flowEl.appendChild(
          el("div", { class: cls }, [
            el("span", { class: "sc-flow__num" }, String(i + 1)),
            el("span", {}, s.label),
          ])
        );
      });
    }

    _renderStatus() {
      const s = STATUS[this.status] || STATUS.idle;
      this._statusEl.innerHTML = "";
      this._statusEl.appendChild(
        el("span", { class: `sc-status__badge ${s.cls}` }, s.label)
      );
      const count = this.messages.filter((m) => m.role !== "system").length;
      this._statusEl.appendChild(
        el("span", {}, count > 0 ? `${count} メッセージ` : "履歴なし")
      );
      if (this._sendBtn) {
        this._sendBtn.disabled =
          (this._textarea && this._textarea.value.trim().length === 0) ||
          this.status === "thinking";
      }
    }

    _renderMessages() {
      this._messagesEl.innerHTML = "";

      if (this.messages.length === 0) {
        const empty = el("div", { class: "sc-empty" }, [
          el("div", { class: "sc-empty__title" }, "AI と話し始めましょう"),
          el(
            "div",
            { class: "sc-empty__hint" },
            "下の入力欄に質問や指示を入力すると、AI が回答します。"
          ),
          el(
            "div",
            { class: "sc-empty__suggests" },
            SUGGESTIONS.map((s) =>
              el(
                "button",
                {
                  class: "sc-suggest",
                  type: "button",
                  onclick: () => {
                    this._textarea.value = s;
                    this._textarea.dispatchEvent(new Event("input"));
                    this._textarea.focus();
                  },
                },
                s
              )
            )
          ),
        ]);
        this._messagesEl.appendChild(empty);
        this._renderStatus();
        return;
      }

      this.messages.forEach((m) => {
        const wrap = el("div", {
          class: `sc-msg sc-msg--${m.role}`,
          "data-id": m.id,
        });

        const avatarText =
          m.role === "user" ? "You" : m.role === "assistant" ? "AI" : "—";

        wrap.appendChild(
          el("div", { class: "sc-msg__meta" }, [
            el("span", { class: "sc-msg__avatar" }, avatarText),
            el(
              "span",
              { class: "sc-msg__role" },
              m.role === "user"
                ? "あなた"
                : m.role === "assistant"
                ? "アシスタント"
                : "システム"
            ),
            el("span", { class: "sc-msg__time" }, m.time),
          ])
        );

        if (m.streaming && !m.content) {
          wrap.appendChild(
            el("div", { class: "sc-msg__body sc-typing" }, [
              el("span"), el("span"), el("span"),
            ])
          );
        } else {
          wrap.appendChild(el("div", { class: "sc-msg__body" }, m.content));
        }
        this._messagesEl.appendChild(wrap);
      });
      this._renderStatus();
    }

    _scrollToBottom() {
      requestAnimationFrame(() => {
        this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
      });
    }

    /* ---------- Send flow ---------- */
    _handleSend(textarea) {
      const text = textarea.value.trim();
      if (!text) return;

      this.aborted = false;

      // Step 1: input -> 2: send
      this.setFlow(1);
      this.setStatus("sending");
      this.pushMessage("user", text);

      textarea.value = "";
      textarea.style.height = "auto";

      // Step 3: thinking
      this.setFlow(2);
      this.setStatus("thinking");
      const aiId = this.pushMessage("assistant", "", { streaming: true });

      const ctx = {
        push: (chunk) => {
          if (this.aborted) return;
          this.appendToMessage(aiId, chunk);
        },
        done: () => {
          if (this.aborted) return;
          this.finalizeMessage(aiId);
          this.setFlow(3);
          this.setStatus("done");
        },
        fail: (err) => {
          this.appendToMessage(
            aiId,
            (err && err.message) || "応答の取得に失敗しました。"
          );
          this.finalizeMessage(aiId);
          this.setStatus("error");
        },
      };

      if (typeof this.opts.onSend === "function") {
        try {
          this.opts.onSend(text, ctx);
        } catch (e) {
          ctx.fail(e);
        }
      } else {
        // Fallback demo: echo after delay
        const reply =
          "（デモ応答）受信しました：\n" + text + "\n\nここに AI の回答が表示されます。";
        let i = 0;
        const tick = () => {
          if (this.aborted) return;
          if (i >= reply.length) return ctx.done();
          ctx.push(reply.slice(i, i + 3));
          i += 3;
          setTimeout(tick, 18);
        };
        setTimeout(tick, 250);
      }
    }
  }

  global.SidebarChat = SidebarChat;
})(window);
