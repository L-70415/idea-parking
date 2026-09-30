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
let selectedLinks = new Set(); // 关联选择区已勾选的 id

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

// ========== 关联选择（带自动簇） ==========
function showLinkZone() {
  selectedLinks = new Set();
  const all = ideas.slice().reverse().filter(i => i.id !== pendingIdea.id);

  if (all.length === 0) {
    hideLinkZone();
    return;
  }

  renderLinkOptions();
  linkZone.classList.remove('hidden');
  linkZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 根据已勾选的，推导出"同一方向"的想法
function computeCluster() {
  // 收集 selectedLinks 里每个 id 的正向和反向关联
  // 正向：A.links 里有 B
  // 反向：C.links 里有 A
  const cluster = new Set();

  selectedLinks.forEach(id => {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    // 正向：这个想法关联了谁
    (idea.links || []).forEach(lid => {
      if (!selectedLinks.has(lid)) cluster.add(lid);
    });
    // 反向：谁关联了这个想法
    ideas.forEach(i => {
      if (i.links && i.links.includes(id) && !selectedLinks.has(i.id)) {
        cluster.add(i.id);
      }
    });
  });

  return cluster;
}

function renderLinkOptions() {
  const all = ideas.slice().reverse().filter(i => i.id !== pendingIdea.id);
  const cluster = computeCluster();

  // 计算"同一方向"组的分数：和已勾选项有多少项直接相关
  const clusterScores = new Map();
  cluster.forEach(cid => {
    const target = ideas.find(i => i.id === cid);
    if (!target) return;
    let score = 0;
    selectedLinks.forEach(sid => {
      const src = ideas.find(i => i.id === sid);
      if (!src) return;
      // src 正向关联 cid？
      if ((src.links || []).includes(cid)) score++;
      // cid 正向关联 src？
      if ((target.links || []).includes(sid)) score++;
    });
    clusterScores.set(cid, score);
  });

  // 同一方向组：按分数降序
  const clusterItems = all.filter(i => cluster.has(i.id))
    .sort((a, b) => (clusterScores.get(b.id) || 0) - (clusterScores.get(a.id) || 0));

  // 其他组：剩下的
  const otherItems = all.filter(i => !cluster.has(i.id) && !selectedLinks.has(i.id));

  linkList.innerHTML = '';

  // 已勾选的（固定在最顶部显示）
  const selectedArr = all.filter(i => selectedLinks.has(i.id));
  if (selectedArr.length > 0) {
    const grp = document.createElement('div');
    grp.className = 'link-group';
    grp.innerHTML = `<div class="link-group-title">✅ 已选 <span class="count-tag">${selectedArr.length}</span></div>`;
    selectedArr.forEach(item => grp.appendChild(makeLinkOption(item, true, false)));
    linkList.appendChild(grp);
  }

  // 同一方向组
  if (clusterItems.length > 0) {
    const grp = document.createElement('div');
    grp.className = 'link-group';
    grp.innerHTML = `<div class="link-group-title">🔗 同一方向的 <span class="count-tag">${clusterItems.length}</span></div>`;
    clusterItems.forEach(item => grp.appendChild(makeLinkOption(item, false, true)));
    linkList.appendChild(grp);
  }

  // 其他
  if (otherItems.length > 0) {
    const grp = document.createElement('div');
    grp.className = 'link-group';
    grp.innerHTML = `<div class="link-group-title">📋 其他 <span class="count-tag">${otherItems.length}</span></div>`;
    otherItems.forEach(item => grp.appendChild(makeLinkOption(item, false, false)));
    linkList.appendChild(grp);
  }
}

function makeLinkOption(item, isSelected, isCluster) {
  const div = document.createElement('div');
  div.className = 'link-option' + (isSelected ? ' selected' : '') + (isCluster ? ' same-cluster' : '');
  div.innerHTML = `
    <input type="checkbox" value="${item.id}" id="lk_${item.id}" ${isSelected ? 'checked' : ''}>
    <label for="lk_${item.id}" class="link-text">#${item.id} · ${escapeHtml(item.content)}</label>
  `;
  const cb = div.querySelector('input');
  cb.addEventListener('change', () => {
    if (cb.checked) selectedLinks.add(item.id);
    else selectedLinks.delete(item.id);
    renderLinkOptions(); // 重绘，让自动簇实时更新
  });
  return div;
}

function hideLinkZone() {
  linkZone.classList.add('hidden');
  pendingIdea = null;
  selectedLinks.clear();
  input.focus();
}

confirmLink.addEventListener('click', () => {
  if (!pendingIdea) return;
  const idea = ideas.find(i => i.id === pendingIdea.id);
  if (idea) {
    idea.links = [...selectedLinks];
    saveIdeas(ideas);
  }
  hideLinkZone();
  render();
});

skipLink.addEventListener('click', hideLinkZone);

// ========== 浮层（查看完整想法） ==========
function openDetail(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  modalCurrentId = id;

  detailId.textContent = `#${id}`;
  detailContent.textContent = idea.content;

  // 双向关联
  const forward = (idea.links || []).map(lid => ideas.find(i => i.id === lid)).filter(Boolean);
  const backward = ideas.filter(i => i.links && i.links.includes(id));

  if (forward.length === 0 && backward.length === 0) {
    detailLinks.innerHTML = '<div style="color:#7a7a8a;font-size:12px;">还没有关联</div>';
  } else {
    let html = '';
    if (forward.length) {
      html += `<div>它关联了 →</div><div class="links-row">`;
      forward.forEach(t => {
        html += `<span class="tag" data-id="${t.id}">#${t.id} ${escapeHtml(t.content.slice(0,20))}</span>`;
      });
      html += `</div>`;
    }
    if (backward.length) {
      html += `<div style="margin-top:6px;">被这些关联 ←</div><div class="links-row">`;
      backward.forEach(t => {
        html += `<span class="tag" data-id="${t.id}">#${t.id} ${escapeHtml(t.content.slice(0,20))}</span>`;
      });
      html += `</div>`;
    }
    detailLinks.innerHTML = html;
    // 浮层里的 tag 也能点击继续跳转
    detailLinks.querySelectorAll('.tag').forEach(t => {
      t.addEventListener('click', () => openDetail(Number(t.dataset.id)));
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
  // 滚到那条想法
  setTimeout(() => {
    const target = ideaList.querySelector(`.idea-item[data-id="${modalCurrentId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.background = '#e9456033';
      setTimeout(() => { target.style.background = ''; }, 1200);
    }
  }, 100);
});

// ========== 渲染列表 ==========
function render() {
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

    let linkTags = '';
    if (item.links && item.links.length) {
      linkTags = `<div class="links">` +
        item.links.map(lid => {
          const target = ideas.find(i => i.id === lid);
          const preview = target ? target.content.slice(0, 15) + (target.content.length > 15 ? '…' : '') : '#已删除';
          return `<span class="tag" data-id="${item.id}" data-target="${lid}">→ #${lid} ${preview}</span>`;
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
  }).join('');

  // 列表项点击 → 打开详情浮层（点文字区域）
  ideaList.querySelectorAll('.idea-item .content, .idea-item .meta span').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.idea-item');
      if (item) openDetail(Number(item.dataset.id));
    });
  });

  // 关联标签点击
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
