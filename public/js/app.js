// AI Book Publisher - Dashboard Application
const API = '/api';
let currentPage = 'dashboard';
let books = [];

// ===== Navigation =====
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (pageEl) pageEl.style.display = 'block';
  if (navEl) navEl.classList.add('active');

  currentPage = page;
  loadPageData(page);
}

function loadPageData(page) {
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'books': loadBooks(); break;
    case 'social': loadBooks().then(() => populateBookSelects()); loadSocialPosts(); break;
    case 'content': loadBooks().then(() => populateBookSelects()); break;
    case 'email': loadBooks().then(() => populateBookSelects()); loadEmailData(); break;
    case 'ads': loadBooks().then(() => populateBookSelects()); loadAdsCampaigns(); break;
    case 'approvals': loadApprovals(); break;
    case 'analytics': loadAnalytics(); break;
  }
}

// ===== Toast Notifications =====
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ===== Modal =====
function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ===== API Helpers =====
async function apiGet(path) {
  try {
    const res = await fetch(`${API}${path}`);
    return await res.json();
  } catch (e) {
    toast(`API Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    toast(`API Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

// ===== Dashboard =====
async function loadDashboard() {
  const res = await apiGet('/analytics/dashboard');
  if (!res.success) return;

  const d = res.data;
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue">&#128218;</div>
      <div class="stat-value">${d.totalBooks}</div>
      <div class="stat-label">Books Tracked</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">&#9998;</div>
      <div class="stat-value">${d.totalContent}</div>
      <div class="stat-label">Content Pieces</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple">&#128640;</div>
      <div class="stat-value">${d.totalCampaigns}</div>
      <div class="stat-label">Campaigns</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon yellow">&#9993;</div>
      <div class="stat-value">${d.totalSubscribers}</div>
      <div class="stat-label">Subscribers</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">&#9888;</div>
      <div class="stat-value">${d.pendingApprovals}</div>
      <div class="stat-label">Pending Approvals</div>
    </div>
  `;

  // Update approval badge
  const badge = document.getElementById('approval-count');
  if (d.pendingApprovals > 0) {
    badge.style.display = 'inline';
    badge.textContent = d.pendingApprovals;
  } else {
    badge.style.display = 'none';
  }

  // Dashboard approvals
  const approvalsEl = document.getElementById('dashboard-approvals');
  const appRes = await apiGet('/approvals/pending');
  if (appRes.success && appRes.data.length > 0) {
    approvalsEl.innerHTML = appRes.data.slice(0, 3).map(a => `
      <div class="approval-card">
        <div class="approval-header">
          <div>
            <div class="approval-type">${a.type.replace(/_/g, ' ')}</div>
            <div style="font-size:14px;color:var(--gray-700);margin-top:4px">${a.action}</div>
          </div>
          <div class="approval-amount">$${a.amount.toFixed(2)}</div>
        </div>
        <div class="approval-actions">
          <button class="btn btn-sm btn-success" onclick="approveRequest('${a.id}')">Approve</button>
          <button class="btn btn-sm btn-danger" onclick="denyRequest('${a.id}')">Deny</button>
        </div>
      </div>
    `).join('');
  } else {
    approvalsEl.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:20px">No pending approvals</p>';
  }

  // Activity feed
  const activityEl = document.getElementById('dashboard-activity');
  if (d.recentActivity && d.recentActivity.length > 0) {
    activityEl.innerHTML = d.recentActivity.slice(0, 10).map(a => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div>
          <div class="activity-text">${formatAction(a.action)} ${a.entity_type ? `(${a.entity_type})` : ''}</div>
          <div class="activity-time">${timeAgo(a.created_at)}</div>
        </div>
      </div>
    `).join('');
  } else {
    activityEl.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:20px">No activity yet. Start by adding a book!</p>';
  }
}

function refreshDashboard() { loadDashboard(); toast('Dashboard refreshed', 'info'); }

// ===== Books =====
async function loadBooks() {
  const res = await apiGet('/books');
  if (!res.success) return;
  books = res.data;
  renderBooksList();
}

function renderBooksList() {
  const el = document.getElementById('books-list');
  if (!books.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128218;</div>
        <h3>No books yet</h3>
        <p>Add your first book to get started with AI-powered marketing.</p>
        <button class="btn btn-primary" onclick="showAddBookModal()">+ Add Book</button>
      </div>`;
    return;
  }

  el.innerHTML = books.map(b => `
    <div class="book-card">
      ${b.cover_image_url
        ? `<img class="book-cover" src="${b.cover_image_url}" alt="${b.title}">`
        : `<div class="book-cover" style="display:flex;align-items:center;justify-content:center;font-size:24px">&#128218;</div>`}
      <div class="book-info">
        <div class="book-title">${b.title || 'Untitled Book'}</div>
        <div class="book-author">${b.author || 'Unknown Author'}</div>
        <div class="book-asin">ASIN: ${b.asin} | ${b.genre || 'Fiction'} ${b.price ? `| ${b.price}` : ''}</div>
        <div class="book-actions">
          <button class="btn btn-sm btn-primary" onclick="scrapeBook('${b.id}')">Fetch Amazon Data</button>
          <button class="btn btn-sm btn-outline" onclick="optimizeListing('${b.id}')">Optimize Listing</button>
          <a href="${b.amazon_url || `https://www.amazon.com/dp/${b.asin}`}" target="_blank" class="btn btn-sm btn-outline">View on Amazon</a>
        </div>
      </div>
    </div>
  `).join('');
}

function showAddBookModal() {
  openModal('Add Book', `
    <div class="form-group">
      <label>ASIN (Amazon Standard Identification Number)</label>
      <input type="text" class="form-control" id="add-book-asin" placeholder="e.g. B0F63Z1XBN">
    </div>
    <div class="form-group">
      <label>Title (optional - will be fetched from Amazon)</label>
      <input type="text" class="form-control" id="add-book-title" placeholder="Book title">
    </div>
    <div class="form-group">
      <label>Author (optional)</label>
      <input type="text" class="form-control" id="add-book-author" placeholder="Author name">
    </div>
  `, `<button class="btn btn-primary" onclick="addBook()">Add Book</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>`);
}

async function addBook() {
  const asin = document.getElementById('add-book-asin').value.trim();
  if (!asin) { toast('Please enter an ASIN', 'error'); return; }

  toast('Adding book...', 'info');
  const res = await apiPost('/books', {
    asin,
    title: document.getElementById('add-book-title').value.trim(),
    author: document.getElementById('add-book-author').value.trim(),
    genre: 'Fiction',
  });

  if (res.success) {
    toast('Book added successfully!', 'success');
    closeModal();
    loadBooks();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function scrapeBook(bookId) {
  toast('Fetching book data from Amazon...', 'info');
  const res = await apiPost(`/books/${bookId}/scrape`);
  if (res.success) {
    toast('Book data updated from Amazon!', 'success');
    loadBooks();
  } else {
    toast(`Scrape failed: ${res.error}`, 'error');
  }
}

async function optimizeListing(bookId) {
  toast('Generating listing optimization...', 'info');
  const res = await apiPost(`/books/${bookId}/optimize`);
  if (res.success) {
    const d = res.data;
    openModal('Listing Optimization', `
      <h4 style="margin-bottom:12px">Title Suggestions</h4>
      <ul style="margin-bottom:16px;padding-left:20px">
        ${(d.titleSuggestions || []).map(t => `<li>${t}</li>`).join('')}
      </ul>
      <h4 style="margin-bottom:12px">Description</h4>
      <div class="content-preview">${d.descriptionSuggestion || 'N/A'}</div>
      <h4 style="margin:16px 0 12px">Keyword Suggestions</h4>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${(d.keywordSuggestions || []).map(k => `<span class="badge badge-info">${k}</span>`).join('')}
      </div>
      <h4 style="margin:16px 0 12px">Category Recommendations</h4>
      <ul style="padding-left:20px">
        ${(d.categoryRecommendations || []).map(c => `<li>${c}</li>`).join('')}
      </ul>
      <h4 style="margin:16px 0 12px">Pricing Insights</h4>
      <p>${d.pricingInsights || 'N/A'}</p>
      ${d.a10Checklist ? `
        <h4 style="margin:16px 0 12px">A10 Algorithm Checklist</h4>
        <table>
          <thead><tr><th>Factor</th><th>Status</th><th>Recommendation</th></tr></thead>
          <tbody>
            ${d.a10Checklist.map(item => `
              <tr>
                <td>${item.factor}</td>
                <td><span class="badge badge-${item.status === 'good' ? 'success' : item.status === 'critical' ? 'danger' : 'warning'}">${item.status}</span></td>
                <td>${item.recommendation}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    `);
    toast('Optimization report ready!', 'success');
  } else {
    toast(`Optimization failed: ${res.error}`, 'error');
  }
}

// ===== Populate Book Selects =====
function populateBookSelects() {
  const selects = ['social-book-select', 'blog-book-select', 'seo-book-select',
    'landing-book-select', 'email-book-select', 'ads-book-select'];

  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = books.map(b =>
        `<option value="${b.id}">${b.title || b.asin} (${b.asin})</option>`
      ).join('');
    }
  });
}

// ===== Social Media =====
async function generateSocialPost() {
  const bookId = document.getElementById('social-book-select').value;
  const platform = document.getElementById('social-platform-select').value;
  const prompt = document.getElementById('social-prompt').value.trim();

  if (!bookId) { toast('Select a book first', 'error'); return; }
  toast(`Generating ${platform} post...`, 'info');

  const res = await apiPost('/content/social/generate', { bookId, platform, prompt: prompt || undefined });
  if (res.success) {
    toast('Post generated!', 'success');
    loadSocialPosts();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function generateAllPlatformPosts() {
  const bookId = document.getElementById('social-book-select').value;
  if (!bookId) { toast('Select a book first', 'error'); return; }

  toast('Generating posts for all platforms...', 'info');
  const res = await apiPost('/content/social/generate-all', { bookId });
  if (res.success) {
    toast(`Generated ${res.data.length} posts!`, 'success');
    loadSocialPosts();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function loadSocialPosts() {
  const res = await apiGet('/content?type=social_post');
  if (!res.success) return;

  const el = document.getElementById('social-posts-list');
  if (!res.data.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128172;</div><h3>No posts yet</h3><p>Generate your first social media post above.</p></div>';
    return;
  }

  el.innerHTML = res.data.map(p => `
    <div style="border:1px solid var(--gray-200);border-radius:8px;padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="badge badge-info">${p.platform || 'unknown'}</span>
        <span class="badge badge-${p.status === 'published' ? 'success' : p.status === 'scheduled' ? 'warning' : 'gray'}">${p.status}</span>
      </div>
      <div class="content-preview" style="max-height:150px">${escapeHtml(p.body || '')}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" onclick="publishPost('${p.id}')">Publish</button>
        <button class="btn btn-sm btn-outline" onclick="viewContent('${p.id}')">View Full</button>
        <button class="btn btn-sm btn-danger" onclick="deleteContent('${p.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function publishPost(id) {
  toast('Publishing post...', 'info');
  const res = await apiPost('/content/social/publish', { postId: id });
  if (res.success) {
    toast(res.message, 'success');
    loadSocialPosts();
  } else {
    toast('API not configured. Post saved as draft.', 'warning');
  }
}

// ===== Content & SEO =====
function switchContentTab(tab) {
  document.querySelectorAll('[id^="content-tab-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('#page-content .tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`content-tab-${tab}`).style.display = 'block';
  event.target.classList.add('active');
}

async function generateBlogPost() {
  const bookId = document.getElementById('blog-book-select').value;
  const keyword = document.getElementById('blog-keyword').value.trim();
  if (!bookId || !keyword) { toast('Select a book and enter a keyword', 'error'); return; }

  toast('Generating blog post...', 'info');
  const res = await apiPost('/content/blog/generate', { bookId, keyword });
  if (res.success) {
    toast('Blog post generated!', 'success');
    openModal(res.data.title, `
      <div class="content-preview" style="max-height:500px">${marked(res.data.content || '')}</div>
      <div style="margin-top:12px">
        <strong>Meta Description:</strong> ${res.data.metaDescription || ''}
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
        ${(res.data.tags || []).map(t => `<span class="badge badge-info">${t}</span>`).join('')}
      </div>
    `);
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function researchKeywords() {
  const bookId = document.getElementById('seo-book-select').value;
  if (!bookId) { toast('Select a book first', 'error'); return; }

  toast('Researching keywords...', 'info');
  const res = await apiPost('/content/seo/keywords', { bookId });
  if (res.success) {
    const d = res.data;
    document.getElementById('seo-results').innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Keyword Research Results</h3></div>
        <div class="card-body">
          <h4 style="margin-bottom:12px">Primary Keywords</h4>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
            ${(d.primary || []).map(k => `<span class="badge badge-success">${k}</span>`).join('')}
          </div>
          <h4 style="margin-bottom:12px">Secondary Keywords</h4>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
            ${(d.secondary || []).map(k => `<span class="badge badge-info">${k}</span>`).join('')}
          </div>
          <h4 style="margin-bottom:12px">Long-tail Keywords (Blog Topics)</h4>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(d.longtail || []).map(k => `<span class="badge badge-gray">${k}</span>`).join('')}
          </div>
        </div>
      </div>`;
    toast('Keywords researched!', 'success');
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function performSeoAudit() {
  const bookId = document.getElementById('seo-book-select').value;
  if (!bookId) { toast('Select a book first', 'error'); return; }

  toast('Performing full SEO audit...', 'info');
  const res = await apiPost('/content/seo/audit', { bookId });
  if (res.success) {
    const d = res.data;
    openModal('SEO Audit Report', `
      <h4>Content Gaps</h4>
      <ul style="padding-left:20px;margin-bottom:16px">
        ${(d.contentGaps || []).map(g => `<li>${g}</li>`).join('')}
      </ul>
      <h4>Recommendations</h4>
      <ul style="padding-left:20px;margin-bottom:16px">
        ${(d.recommendations || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
      <h4>Competitor Insights</h4>
      <ul style="padding-left:20px">
        ${(d.competitorAnalysis || []).map(c => `<li>${typeof c === 'string' ? c : JSON.stringify(c)}</li>`).join('')}
      </ul>
    `);
    toast('SEO audit complete!', 'success');
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function generateLandingPage() {
  const bookId = document.getElementById('landing-book-select').value;
  if (!bookId) { toast('Select a book first', 'error'); return; }

  toast('Generating landing page...', 'info');
  const res = await apiPost('/content/landing/generate', { bookId });
  if (res.success) {
    openModal('Landing Page Preview', `
      <p style="margin-bottom:12px">Landing page generated! Preview below:</p>
      <iframe srcdoc="${escapeHtml(res.data.html || '')}" style="width:100%;height:500px;border:1px solid var(--gray-200);border-radius:8px"></iframe>
    `);
    toast('Landing page generated!', 'success');
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

// ===== Email Marketing =====
async function loadEmailData() {
  // Load subscriber stats
  const subRes = await apiGet('/content/email/subscribers');
  const statsEl = document.getElementById('subscriber-stats');
  if (subRes.success) {
    const subs = subRes.data || [];
    const active = subs.filter(s => s.status === 'active').length;
    statsEl.innerHTML = `
      <div style="text-align:center">
        <div class="stat-value">${active}</div>
        <div class="stat-label">Active Subscribers</div>
        <div style="margin-top:12px;color:var(--gray-500);font-size:13px">${subs.length} total</div>
      </div>`;
  }

  // Load campaigns
  const campRes = await apiGet('/content/email/campaigns');
  const campEl = document.getElementById('email-campaigns-list');
  if (campRes.success && campRes.data.length > 0) {
    campEl.innerHTML = `<table>
      <thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Sent</th><th>Actions</th></tr></thead>
      <tbody>
        ${campRes.data.map(c => `
          <tr>
            <td>${c.name}</td>
            <td>${c.subject}</td>
            <td><span class="badge badge-${c.status === 'sent' ? 'success' : 'gray'}">${c.status}</span></td>
            <td>${c.sent_count || 0}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="sendEmailCampaign('${c.id}', true)">Test Send</button>
              <button class="btn btn-sm btn-success" onclick="sendEmailCampaign('${c.id}', false)">Send All</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  } else {
    campEl.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:20px">No email campaigns yet.</p>';
  }
}

async function generateEmailCampaign() {
  const bookId = document.getElementById('email-book-select').value;
  const emailType = document.getElementById('email-type-select').value;
  if (!bookId) { toast('Select a book first', 'error'); return; }

  toast('Generating email campaign...', 'info');
  const res = await apiPost('/content/email/generate', { bookId, emailType });
  if (res.success) {
    toast('Email campaign created!', 'success');
    openModal(`Preview: ${res.data.subject}`, `
      <p><strong>Subject:</strong> ${res.data.subject}</p>
      <div class="content-preview" style="max-height:400px">${res.data.bodyHtml || escapeHtml(res.data.bodyText || '')}</div>
    `);
    loadEmailData();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function sendEmailCampaign(campaignId, testMode) {
  if (!testMode && !confirm('Send this campaign to ALL subscribers?')) return;
  toast(testMode ? 'Sending test email...' : 'Sending campaign...', 'info');
  const res = await apiPost('/content/email/send', { campaignId, testMode });
  if (res.success) {
    toast(`Sent: ${res.data.sent} emails, Failed: ${res.data.failed}`, res.data.sent > 0 ? 'success' : 'warning');
    loadEmailData();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

function showAddSubscriberModal() {
  openModal('Add Subscriber', `
    <div class="form-group">
      <label>Email</label>
      <input type="email" class="form-control" id="sub-email" placeholder="reader@example.com">
    </div>
    <div class="form-group">
      <label>Name (optional)</label>
      <input type="text" class="form-control" id="sub-name" placeholder="Reader Name">
    </div>
  `, `<button class="btn btn-primary" onclick="addSubscriber()">Add Subscriber</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>`);
}

async function addSubscriber() {
  const email = document.getElementById('sub-email').value.trim();
  if (!email) { toast('Enter an email address', 'error'); return; }

  const res = await apiPost('/content/email/subscribe', {
    email,
    name: document.getElementById('sub-name').value.trim(),
    source: 'manual',
  });

  if (res.success) {
    toast('Subscriber added!', 'success');
    closeModal();
    loadEmailData();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

// ===== Amazon Ads =====
async function loadAdsCampaigns() {
  const res = await apiGet('/campaigns');
  const el = document.getElementById('ads-campaigns-list');

  if (res.success && res.data.length > 0) {
    el.innerHTML = `<table>
      <thead><tr><th>Name</th><th>Type</th><th>Budget</th><th>Spent</th><th>Status</th></tr></thead>
      <tbody>
        ${res.data.map(c => `
          <tr>
            <td>${c.name}</td>
            <td>${c.type}</td>
            <td>$${(c.budget || 0).toFixed(2)}</td>
            <td>$${(c.spent || 0).toFixed(2)}</td>
            <td><span class="badge badge-${c.status === 'active' ? 'success' : c.status === 'pending_approval' ? 'warning' : 'gray'}">${c.status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  } else {
    el.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:20px">No ad campaigns yet.</p>';
  }
}

async function createAdCampaign() {
  const bookId = document.getElementById('ads-book-select').value;
  const name = document.getElementById('ads-name').value.trim();
  if (!bookId || !name) { toast('Select a book and enter a name', 'error'); return; }

  const dailyBudget = parseFloat(document.getElementById('ads-daily-budget').value) || 5;
  const totalBudget = parseFloat(document.getElementById('ads-total-budget').value) || 100;
  const type = document.getElementById('ads-type').value;

  toast('Creating ad campaign (requires approval)...', 'info');
  const res = await apiPost('/campaigns/ads', {
    bookId, name, type, dailyBudget, totalBudget, keywords: [],
  });

  if (res.success) {
    toast(`Campaign created! Approval required: $${totalBudget}`, 'warning');
    loadAdsCampaigns();
    loadDashboard(); // refresh approval count
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function generateAdKeywords() {
  const bookId = document.getElementById('ads-book-select').value;
  if (!bookId) { toast('Select a book first', 'error'); return; }

  const book = books.find(b => b.id === bookId);
  if (!book) return;

  toast('Generating ad keywords...', 'info');
  const res = await apiPost('/campaigns/ads/keywords', { asin: book.asin });
  if (res.success && res.data.length) {
    openModal('Suggested Ad Keywords', `
      <table>
        <thead><tr><th>Keyword</th><th>Match Type</th><th>Suggested Bid</th></tr></thead>
        <tbody>
          ${res.data.map(k => `
            <tr>
              <td>${k.keyword}</td>
              <td><span class="badge badge-info">${k.matchType}</span></td>
              <td>$${(k.bid || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `);
    toast('Keywords generated!', 'success');
  } else {
    toast('No keywords generated', 'warning');
  }
}

// ===== Approvals =====
async function loadApprovals() {
  const res = await apiGet('/approvals');
  if (!res.success) return;

  const el = document.getElementById('approvals-list');
  const pending = res.data.filter(a => a.status === 'pending');
  const resolved = res.data.filter(a => a.status !== 'pending');

  const totalPending = pending.reduce((sum, a) => sum + a.amount, 0);
  document.getElementById('approval-total-pending').textContent = `$${totalPending.toFixed(2)} pending`;

  if (!res.data.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9989;</div>
        <h3>No approvals</h3>
        <p>When marketing actions require money, they'll appear here for your approval.</p>
      </div>`;
    return;
  }

  let html = '';

  if (pending.length) {
    html += '<h3 style="margin-bottom:16px">Pending Approvals</h3>';
    html += pending.map(a => `
      <div class="approval-card">
        <div class="approval-header">
          <div>
            <div class="approval-type">${a.type.replace(/_/g, ' ')}</div>
            <div style="font-size:16px;font-weight:600;margin-top:4px">${a.action}</div>
          </div>
          <div class="approval-amount">$${a.amount.toFixed(2)}</div>
        </div>
        <div class="approval-description">${a.description}</div>
        <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px">Requested: ${timeAgo(a.requestedAt)}</div>
        <div class="approval-actions">
          <button class="btn btn-success" onclick="approveRequest('${a.id}')">Approve</button>
          <button class="btn btn-danger" onclick="denyRequest('${a.id}')">Deny</button>
        </div>
      </div>
    `).join('');
  }

  if (resolved.length) {
    html += '<h3 style="margin:24px 0 16px">Resolved</h3>';
    html += `<table>
      <thead><tr><th>Type</th><th>Action</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>
        ${resolved.map(a => `
          <tr>
            <td>${a.type.replace(/_/g, ' ')}</td>
            <td>${a.action}</td>
            <td>$${a.amount.toFixed(2)}</td>
            <td><span class="badge badge-${a.status === 'approved' ? 'success' : 'danger'}">${a.status}</span></td>
            <td>${timeAgo(a.resolvedAt || a.requestedAt)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  }

  el.innerHTML = html;
}

async function approveRequest(id) {
  const res = await apiPost(`/approvals/${id}/approve`, {});
  if (res.success) {
    toast(`Approved: ${res.message || 'Done'}`, 'success');
    loadApprovals();
    loadDashboard();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

async function denyRequest(id) {
  if (!confirm('Are you sure you want to deny this request?')) return;
  const res = await apiPost(`/approvals/${id}/deny`, {});
  if (res.success) {
    toast('Request denied', 'info');
    loadApprovals();
    loadDashboard();
  } else {
    toast(`Failed: ${res.error}`, 'error');
  }
}

// ===== Analytics =====
async function loadAnalytics() {
  const res = await apiGet('/analytics/dashboard');
  if (!res.success) return;

  const d = res.data;
  const el = document.getElementById('analytics-content');

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">&#128218;</div>
        <div class="stat-value">${d.totalBooks}</div>
        <div class="stat-label">Books</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">&#9998;</div>
        <div class="stat-value">${d.totalContent}</div>
        <div class="stat-label">Content Pieces</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple">&#128640;</div>
        <div class="stat-value">${d.totalCampaigns}</div>
        <div class="stat-label">Campaigns</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow">&#9993;</div>
        <div class="stat-value">${d.totalSubscribers}</div>
        <div class="stat-label">Subscribers</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3>Content by Type</h3></div>
        <div class="card-body">
          ${Object.keys(d.contentByType || {}).length > 0 ?
            `<table>
              <thead><tr><th>Type</th><th>Count</th></tr></thead>
              <tbody>
                ${Object.entries(d.contentByType).map(([type, count]) =>
                  `<tr><td>${type.replace(/_/g, ' ')}</td><td>${count}</td></tr>`
                ).join('')}
              </tbody>
            </table>` :
            '<p style="color:var(--gray-400);text-align:center">No content yet</p>'
          }
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Content by Status</h3></div>
        <div class="card-body">
          ${Object.keys(d.contentByStatus || {}).length > 0 ?
            `<table>
              <thead><tr><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                ${Object.entries(d.contentByStatus).map(([status, count]) =>
                  `<tr><td><span class="badge badge-${status === 'published' ? 'success' : status === 'draft' ? 'gray' : 'info'}">${status}</span></td><td>${count}</td></tr>`
                ).join('')}
              </tbody>
            </table>` :
            '<p style="color:var(--gray-400);text-align:center">No content yet</p>'
          }
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:24px">
      <div class="card-header"><h3>Financial Summary</h3></div>
      <div class="card-body">
        <div class="grid-3">
          <div style="text-align:center">
            <div class="stat-value" style="color:var(--warning)">$${(d.approvalSummary?.pending || 0).toFixed(2)}</div>
            <div class="stat-label">Pending Spend</div>
          </div>
          <div style="text-align:center">
            <div class="stat-value" style="color:var(--success)">$${(d.approvalSummary?.totalSpend || 0).toFixed(2)}</div>
            <div class="stat-label">Approved Spend</div>
          </div>
          <div style="text-align:center">
            <div class="stat-value" style="color:var(--danger)">${d.approvalSummary?.denied || 0}</div>
            <div class="stat-label">Denied Requests</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== Content Management =====
async function viewContent(id) {
  const res = await apiGet(`/content/${id}`);
  if (res.success) {
    const c = res.data;
    openModal(c.title || 'Content', `
      <div style="margin-bottom:12px">
        <span class="badge badge-info">${c.platform || c.type}</span>
        <span class="badge badge-${c.status === 'published' ? 'success' : 'gray'}">${c.status}</span>
      </div>
      <div class="content-preview" style="max-height:500px;white-space:pre-wrap">${escapeHtml(c.body || '')}</div>
    `);
  }
}

async function deleteContent(id) {
  if (!confirm('Delete this content?')) return;
  const res = await fetch(`${API}/content/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    toast('Content deleted', 'info');
    loadSocialPosts();
  }
}

// ===== Utility Functions =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function marked(md) {
  // Simple markdown to HTML
  return md
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function formatAction(action) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function timeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
