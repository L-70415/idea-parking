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
let pendingIdea = null;

// ========== 图论：连通分量 ==========
// 把想法看作节点、关联看作边，自动算出"谁和谁一伙"
function computeClusters(allIdeas) {
  const idSet = new Set(allIdeas.map(i => i.id));
  // 构建双向邻接表
  const graph = new Map();
  allIdeas.forEach(i => graph.set(i.id, []));
  allIdeas.forEach(i => {
    (i.links || []).forEach(lid => {
      if (idSet.has(lid)) {
        graph.get(i.id).push(lid);
        graph.get(lid)?.push(i.id);
      }
    });
  });

  const visited = new Set();
  const clusters = [];

  allIdeas.forEach(i => {
    if (visited.has(i.id)) return;
    // BFS 找这个点所在的整个连通分量
    const queue = [i.id];
    visited.add(i.id);
    const cluster = [];
    while (queue.length) {
      const cur = queue.shift();
      const idea = allIdeas.find(x => x.id === cur);
      if (idea) cluster.push(idea);
      (graph.get(cur) || []).forEach(nb => {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      });
    }
    clusters.push(cluster);
  });

  // 每个簇内部：按时间新 → 旧
  clusters.forEach(c => {
    c.sort((a, b) => b.id - a.id);
  });

  // 单个想法（没关联）也自成一组 → 放到最前面（最新的在最上）
  const singletonIds = new Set();
  clusters.forEach(c => c.forEach(i => singletonIds.add(i.id)));
  const singletons = [];
  allIdeas.forEach(i => {
    if (!singletonIds.has(i.id)) singletons.push([i]);
  });
  singletons.sort((a, b) => b[0].id - a[0].id); // 单条也按时间新到旧

  // 整体排序：簇之间也按"最新成员时间"新→旧
  const allClusters = clusters.concat(singletons);
  allClusters.sort((a, b) => {
    const maxA = Math.max(...a.map(i => i.id));
    const maxB = Math.max(...b.map(i => i.id));
    return maxB - maxA;
  });
  return allClusters;
}

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

// 浮层 DOM
const detailModal = document.getElementById('detailModal');
const detailId = document.getElementById('detailId');
const detailContent = document.getElementById('detailContent');
const detailLinks = document.getElementById('detailLinks');
const modalJump = document.getElementById('modalJump');
let modalCurrentId = null;

// ========== 自适应输入框高度 ==========
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

// ========== 提交想法 ==========
function parkIdea() {
  const text = input.value.trim();
  if (!text) return;

  pendingIdea = {
    id: Date.now(),
    content: text,
    time: new Date().toISOString(),
    links: []
  };

  ideas.push(pendingIdea);
  saveIdeas(ideas);

  input.value = '';
  input.style.height = 'auto';
  parkBtn.disabled = true;

  showLinkZone();
  render();
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    parkIdea();
  }
});
parkBtn.addEventListener('click', parkIdea);

// ========== 关联选择（按组分好的，直接选） ==========
function showLinkZone() {
  if (ideas.length <= 1) {
    hideLinkZone();
    return;
  }

  const others = ideas.filter(i => i.id !== pendingIdea.id);
  const clusters = computeClusters(others);

  linkList.innerHTML = '';

  clusters.forEach(c => {
    const grp = document.createElement('div');
    grp.className = 'link-group';
    // 组标题：用簇中心的内容前15字 + 成员数
    const head = c[0];
    const hint = head.content.slice(0, 15) + (head.content.length > 15 ? '…' : '');
    grp.innerHTML = `<div class="link-group-title">🏷️ ${escapeHtml(hint)} <span class="count-tag">${c.length}</span></div>`;

    c.forEach(item => {
      const div = document.createElement('div');
      div.className = 'link-option';
      div.innerHTML = `
        <input type="checkbox" value="${item.id}" id="lk_${item.id}">
        <label for="lk_${item.id}" class="link-text">#${item.id} · ${escapeHtml(item.content)}</label>
      `;
      grp.appendChild(div);
    });

    linkList.appendChild(grp);
  });

  linkZone.classList.remove('hidden');
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

// ========== 浮层 ==========
function openDetail(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  modalCurrentId = id;

  detailId.textContent = `#${id}`;
  detailContent.textContent = idea.content;

  const forward = (idea.links || []).map(lid => ideas.find(i => i.id === lid)).filter(Boolean);
  const backward = ideas.filter(i => i.links && i.links.includes(id));

  if (forward.length === 0 && backward.length === 0) {
    detailLinks.innerHTML = '<div style="color:#7a7a8a;font-size:12px;">还没有关联</div>';
  } else {
    let html = '';
    if (forward.length) {
      html += `<div style="font-size:11px;color:#7a7a8a;margin-bottom:4px;">↓ 它关联了这些（完整内容）</div>`;
      forward.forEach(t => {
        html += `<div class="link-detail-item" data-id="${t.id}">
          <div class="link-detail-id">#${t.id}</div>
          <div class="link-detail-content">${escapeHtml(t.content)}</div>
        </div>`;
      });
    }
    if (backward.length) {
      html += `<div style="font-size:11px;color:#7a7a8a;margin:10px 0 4px;">↑ 这些关联了它</div>`;
      backward.forEach(t => {
        html += `<div class="link-detail-item" data-id="${t.id}">
          <div class="link-detail-id">#${t.id}</div>
          <div class="link-detail-content">${escapeHtml(t.content)}</div>
        </div>`;
      });
    }
    detailLinks.innerHTML = html;
    detailLinks.querySelectorAll('.link-detail-item').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => openDetail(Number(el.dataset.id)));
    });
  }

  detailModal.classList.remove('hidden');
}

function closeDetail() {
  detailModal.classList.add('hidden');
  modalCurrentId = null;
}

document.getElementById('modalClose').addEventListener('click', closeDetail);
document.getElementById('modalCloseBtn').addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeDetail(); });

modalJump.addEventListener('click', () => {
  if (!modalCurrentId) return;
  closeDetail();
  setTimeout(() => {
    const target = ideaList.querySelector(`.idea-item[data-id="${modalCurrentId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.background = '#e9456033';
      setTimeout(() => { target.style.background = ''; }, 1200);
    }
  }, 100);
});

// ========== 渲染列表（按组分好） ==========
function render() {
  countEl.textContent = `${ideas.length} 条`;

  if (ideas.length === 0) {
    ideaList.innerHTML = '';
    emptyTip.classList.remove('hidden');
    return;
  }
  emptyTip.classList.add('hidden');

  const clusters = computeClusters(ideas);

  ideaList.innerHTML = clusters.map((c, ci) => {
    const head = c[0];
    const hint = head.content.slice(0, 15) + (head.content.length > 15 ? '…' : '');
    const groupHtml = c.map(item => renderIdeaItem(item)).join('');
    return `
      <div class="idea-group">
        <div class="group-header" data-group="${ci}">
          <span class="group-icon">🚗</span>
          <span class="group-title">${escapeHtml(hint)}</span>
          <span class="group-count">${c.length} 条</span>
        </div>
        <div class="group-items">${groupHtml}</div>
      </div>
    `;
  }).join('');

  // 点击想法 → 打开详情
  ideaList.querySelectorAll('.idea-item .content, .idea-item .meta span').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.idea-item');
      if (item) openDetail(Number(item.dataset.id));
    });
  });

  // 关联标签点击 → 打开那个
  ideaList.querySelectorAll('.idea-item .links .tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(Number(tag.dataset.target));
    });
  });

  // 删除按钮
  ideaList.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(e.currentTarget.dataset.id);
      if (!confirm('删除这条想法？关联标记会一起清掉。')) return;
      ideas = ideas.filter(i => i.id !== id);
      ideas.forEach(i => {
        i.links = (i.links || []).filter(lid => lid !== id);
      });
      saveIdeas(ideas);
      render();
    });
  });

  parkBtn.disabled = input.value.trim() === '';
}

function renderIdeaItem(item) {
  const time = new Date(item.time);
  const timeStr = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;

  let linkTags = '';
  if (item.links && item.links.length) {
    linkTags = `<div class="links">` +
      item.links.map(lid => {
        const target = ideas.find(i => i.id === lid);
        const preview = target ? target.content.slice(0, 15) + (target.content.length > 15 ? '…' : '') : '#已删除';
        return `<span class="tag" data-target="${lid}">→ #${lid} ${escapeHtml(preview)}</span>`;
      }).join('') +
      `</div>`;
  }

  return `
    <div class="idea-item" data-id="${item.id}">
      <div class="content">${escapeHtml(item.content)}</div>
      ${linkTags}
      <div class="meta">
        <span>${timeStr} · #${item.id}</span>
        <button class="delete" data-id="${item.id}">删除</button>
      </div>
    </div>
  `;
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

// ========== 导入 ==========
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error('格式不对');

      const mode = confirm(
        `备份里有 ${data.length} 条想法。\n\n` +
        `点"确定"= 合并（保留现有 + 加进备份里没有的）\n` +
        `点"取消"= 覆盖（用备份完全替换当前数据）`
      );

      if (mode) {
        const existingIds = new Set(ideas.map(i => i.id));
        data.forEach(item => {
          if (!existingIds.has(item.id)) ideas.push(item);
        });
        alert(`合并完成！现有 ${ideas.length} 条`);
      } else {
        ideas = data;
        alert(`覆盖完成！现在 ${ideas.length} 条`);
      }

      saveIdeas(ideas);
      render();
    } catch (err) {
      alert('导入失败：文件格式不对。\n应该是导出的 .json 文件。');
    }
    importFile.value = '';
  };
  reader.readAsText(file);
});

// ========== 启动 ==========
render();
input.focus();
