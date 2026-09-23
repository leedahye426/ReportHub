// IndexedDB 초기화
const DB_NAME = 'ReportHubDB';
const STORE_NAME = 'reports';
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject('Database error: ' + e.target.errorCode);
  });
}

// DOM 요소
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const uploadModal = document.getElementById('uploadModal');
const uploadForm = document.getElementById('uploadForm');
const dropZone = document.getElementById('dropZone');
const htmlFileInput = document.getElementById('htmlFile');
const fileNameDisplay = document.getElementById('fileNameDisplay');

const reportGrid = document.getElementById('reportGrid');
const searchInput = document.getElementById('searchInput');
const reportCount = document.getElementById('reportCount');

const viewerModal = document.getElementById('viewerModal');
const closeViewerBtn = document.getElementById('closeViewerBtn');
const reportIframe = document.getElementById('reportIframe');
const viewerTitle = document.getElementById('viewerTitle');
const viewerMeta = document.getElementById('viewerMeta');
const newTabBtn = document.getElementById('newTabBtn');

let currentActiveContent = '';
let currentReportPath = '';
let isCurrentFileUrl = false;

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  loadReports();

  openModalBtn.addEventListener('click', () => uploadModal.classList.add('active'));
  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  closeViewerBtn.addEventListener('click', () => viewerModal.classList.remove('active'));

  // 파일선택 & 드래그 앤 드롭
  dropZone.addEventListener('click', () => htmlFileInput.click());
  htmlFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) fileNameDisplay.textContent = e.target.files[0].name;
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
  });
  dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = 'var(--border)');
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length > 0) {
      htmlFileInput.files = e.dataTransfer.files;
      fileNameDisplay.textContent = e.dataTransfer.files[0].name;
    }
  });

  // 폼 제출
  uploadForm.addEventListener('submit', handleUpload);

  // 검색
  searchInput.addEventListener('input', loadReports);

  // 새 창에서 보기
  newTabBtn.addEventListener('click', () => {
    if (isCurrentFileUrl) {
      window.open(currentReportPath, '_blank');
    } else {
      const blob = new Blob([currentActiveContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  });
});

function closeModal() {
  uploadModal.classList.remove('active');
  uploadForm.reset();
  fileNameDisplay.textContent = '선택된 파일 없음';
}

// 1. IndexedDB 업로드 처리
async function handleUpload(e) {
  e.preventDefault();

  const file = htmlFileInput.files[0];
  if (!file) return alert('HTML 파일을 선택해주세요.');

  const reader = new FileReader();
  reader.onload = async function (evt) {
    const htmlContent = evt.target.result;

    const newReport = {
      id: 'local_' + Date.now().toString(),
      title: document.getElementById('title').value,
      author: document.getElementById('author').value,
      description: document.getElementById('description').value,
      content: htmlContent,
      type: 'uploaded',
      date: new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    };

    await saveReportDB(newReport);
    closeModal();
    loadReports();
  };

  reader.readAsText(file);
}

function saveReportDB(report) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(report);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getUploadedReportsDB() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function deleteReportDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 2. reports.json 불러오기
async function getJsonReports() {
  try {
    const res = await fetch('reports.json');
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(item => ({ ...item, type: 'static' }));
  } catch (e) {
    return [];
  }
}

// 3. 두 출처 병합 및 목록 출력
async function loadReports() {
  const [jsonReports, uploadedReports] = await Promise.all([
    getJsonReports(),
    getUploadedReportsDB()
  ]);

  const allReports = [...jsonReports, ...uploadedReports];
  const keyword = searchInput.value.toLowerCase().trim();

  const filteredReports = allReports.filter(r =>
    r.title.toLowerCase().includes(keyword) ||
    r.author.toLowerCase().includes(keyword) ||
    (r.description && r.description.toLowerCase().includes(keyword))
  );

  reportCount.textContent = `총 ${filteredReports.length}개의 리포트`;
  reportGrid.innerHTML = '';

  if (filteredReports.length === 0) {
    reportGrid.innerHTML = `
      <div class="empty-state">
        <i class="ri-folder-unknow-line"></i>
        <p>등록된 리포트가 없거나 검색 결과가 없습니다.</p>
      </div>
    `;
    return;
  }

  filteredReports.forEach(report => {
    const isUploaded = report.type === 'uploaded';
    const card = document.createElement('div');
    card.className = 'report-card';
    card.innerHTML = `
      <div>
        <div class="card-header">
          <h4 class="card-title">${escapeHtml(report.title)}</h4>
          <span class="badge" style="background-color: ${isUploaded ? '#e0e7ff' : '#f1f5f9'}; color: ${isUploaded ? '#4f46e5' : '#475569'};">
            ${isUploaded ? '업로드' : '폴더'}
          </span>
        </div>
        <p class="card-desc">${escapeHtml(report.description || '상세 설명이 없습니다.')}</p>
      </div>
      <div class="card-footer">
        <div>
          <span><strong>${escapeHtml(report.author)}</strong></span> · 
          <span>${report.date}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-outline view-btn"><i class="ri-eye-line"></i> 보기</button>
          ${isUploaded ? `<button class="btn btn-sm btn-danger delete-btn"><i class="ri-delete-bin-line"></i></button>` : ''}
        </div>
      </div>
    `;

    // 보기 버튼
    card.querySelector('.view-btn').addEventListener('click', () => openViewer(report));

    // 삭제 버튼 (업로드 항목만)
    if (isUploaded) {
      card.querySelector('.delete-btn').addEventListener('click', async () => {
        if (confirm(`'${report.title}' 리포트를 삭제하시겠습니까?`)) {
          await deleteReportDB(report.id);
          loadReports();
        }
      });
    }

    reportGrid.appendChild(card);
  });
}

// 뷰어 열기 (버그 수정 반영)
function openViewer(report) {
  viewerTitle.textContent = report.title;
  viewerMeta.textContent = `작성자: ${report.author} | 등록일: ${report.date}`;

  if (report.type === 'static') {
    // 폴더 내 파일일 경우: srcdoc 제거 후 src 적용
    isCurrentFileUrl = true;
    currentReportPath = `reports/${report.fileName}`;
    
    reportIframe.removeAttribute('srcdoc');
    reportIframe.src = currentReportPath;
  } else {
    // 업로드 파일일 경우: src 제거 후 srcdoc 적용
    isCurrentFileUrl = false;
    currentActiveContent = report.content;
    
    reportIframe.removeAttribute('src');
    reportIframe.srcdoc = report.content;
  }

  viewerModal.classList.add('active');
}

function escapeHtml(str) {
  return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : '';
}