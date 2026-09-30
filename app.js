// ========== 本地存储 ==========
const STORAGE_KEY = 'idea_parking_data';

function loadIdeas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveIdeas(ideas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
}

// ========== 状态 ==========
let ideas = loadIdeas();
let pendingIdea = null; // 刚提交、等关联的想法

// ========== DOM ==========
const input = document.getElementById('ideaInput');
const parkBtn = document.getElementById('parkBtn');
const linkZone = document.getElementById('linkZone');
const linkList = document.getElementById('linkList');
const confirmLink = document.getElementById('confirmLink');
const skipLink = document.getElementById('skipLink');
const ideaList = document.getElementById('ideaList');
const emptyTip = document.getElementById('emptyTip');
const countEl = document.getElementById('count');
const exportBtn = document.getElementById('exportBtn');

// ========== 自适应输入框高度 ==========
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

// ========== 提交想法 ==========
function parkIdea() {
  const text = input.value.trim();
  if (!text) return;

  const now = new Date();
  pendingIdea = {
    id: Date.now(),
    content: text,
    time: now.toISOString(),
    links: []
  };

  // 先存进去（无关联），关联之后再补
  ideas.push(pendingIdea);
  saveIdeas(ideas);

  // 清空输入
  input.value = '';
  input.style.height = 'auto';
  parkBtn.disabled = true;

  // 显示关联选择（扫一眼最近15条）
  showLinkZone();
  render();
}

input.addEventListener('keydown', (e) => {
  // Enter 提交（Shift+Enter 换行）
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    parkIdea();
  }
});
parkBtn.addEventListener('click', parkIdea);

// ========== 关联选择 ==========
function showLinkZone() {
  // 显示全部已有想法，让用户自己选（去掉数量限制）
  const recent = ideas.slice().reverse().filter(i => i.id !== pendingIdea.id);

  if (recent.length === 0) {
    // 还没别的想法，跳过关联
    hideLinkZone();
    return;
  }

  linkList.innerHTML = '';
  recent.forEach(item => {
    const div = document.createElement('div');
    div.className = 'link-option';
    div.innerHTML = `
      <input type="checkbox" value="${item.id}" id="lk_${item.id}">
      <label for="lk_${item.id}" class="link-text">
        #${item.id} · ${item.content}
      </label>
    `;
    linkList.appendChild(div);
  });

  linkZone.classList.remove('hidden');
  // 滚到关联区
  linkZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideLinkZone() {
  linkZone.classList.add('hidden');
  pendingIdea = null;
  input.focus();
}

confirmLink.addEventListener('click', () => {
  if (!pendingIdea) return;
  const selected = [...linkList.querySelectorAll('input:checked')].map(cb => Number(cb.value));
  const idea = ideas.find(i => i.id === pendingIdea.id);
  if (idea) {
    idea.links = selected;
    saveIdeas(ideas);
  }
  hideLinkZone();
  render();
});

skipLink.addEventListener('click', hideLinkZone);

// ========== 渲染列表 ==========
function render() {
  // 倒序显示（最新在上）
  const sorted = [...ideas].sort((a, b) => b.id - a.id);

  countEl.textContent = `${ideas.length} 条`;

  if (sorted.length === 0) {
    ideaList.innerHTML = '';
    emptyTip.classList.remove('hidden');
    return;
  }
  emptyTip.classList.add('hidden');

  ideaList.innerHTML = sorted.map(item => {
    const time = new Date(item.time);
    const timeStr = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;

    // 关联标签
    let linkTags = '';
    if (item.links && item.links.length) {
      linkTags = `<div class="links">` +
        item.links.map(lid => {
          const target = ideas.find(i => i.id === lid);
          const preview = target ? target.content.slice(0, 15) + (target.content.length > 15 ? '…' : '') : '#已删除';
          return `<span class="tag">→ #${lid} ${preview}</span>`;
        }).join('') +
        `</div>`;
    }

    return `
      <div class="idea-item">
        <div class="content">${escapeHtml(item.content)}</div>
        ${linkTags}
        <div class="meta">
          <span>${timeStr} · #${item.id}</span>
          <button class="delete" data-id="${item.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  // 删除按钮
  ideaList.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.dataset.id);
      if (!confirm('删除这条想法？关联标记会一起清掉。')) return;
      ideas = ideas.filter(i => i.id !== id);
      // 同时把其他人对它的关联也清掉
      ideas.forEach(i => {
        i.links = (i.links || []).filter(lid => lid !== id);
      });
      saveIdeas(ideas);
      render();
    });
  });

  parkBtn.disabled = input.value.trim() === '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

input.addEventListener('input', () => {
  parkBtn.disabled = input.value.trim() === '';
});

// ========== 导出 ==========
exportBtn.addEventListener('click', () => {
  if (ideas.length === 0) { alert('还没想法可以导出'); return; }

  const data = JSON.stringify(ideas, null, 2);
  const now = new Date();
  const filename = `想法停车场_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.json`;

  // 尝试标准下载方式
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // 保险：同时显示内容让用户能手动复制（WebView 里 a.click 可能被拦截）
  setTimeout(() => {
    if (!confirm('下载已触发。如果没自动下载文件，点"确定"会显示内容让你复制到文件里。')) return;
    const ta = document.createElement('textarea');
    ta.value = `// 文件名：${filename}\n\n${data}`;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:white;color:black;padding:10px;font-size:12px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    alert('已复制到剪贴板！粘贴到任意文件（比如 .txt）保存即可。');
    document.body.removeChild(ta);
  }, 500);
});

// ========== 启动 ==========
render();
input.focus();
