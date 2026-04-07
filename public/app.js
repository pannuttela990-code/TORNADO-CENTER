const state = {
  user: null,
  plans: [],
  faqs: [],
  forumPosts: [],
  dashboard: null,
  adminOverview: null,
  superOverview: null,
  activeTab: 'overview'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Wystąpił błąd.');
  return data;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function currency(value) {
  return `${Number(value || 0).toFixed(2)} zł`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pl-PL');
}

function openModal(view = 'login') {
  $('#authModal').classList.remove('hidden');
  switchAuthView(view);
}

function closeModal() {
  $('#authModal').classList.add('hidden');
}

function switchAuthView(view) {
  $$('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authView === view));
  $('#loginForm').classList.toggle('hidden', view !== 'login');
  $('#registerForm').classList.toggle('hidden', view !== 'register');
}

function renderPlans() {
  const grid = $('#plansGrid');
  grid.innerHTML = state.plans.map((plan, index) => `
    <article class="glass card plan-card ${index === 1 ? 'featured' : ''}">
      <span class="eyebrow">Pakiet ${plan.name}</span>
      <h3>${plan.name}</h3>
      <p>${plan.description || ''}</p>
      <div class="price">${currency(plan.price_monthly)} <span>/ miesiąc</span></div>
      <div class="plan-features">
        ${plan.features.map(feature => `<div>${feature}</div>`).join('')}
      </div>
      <button class="btn btn-primary plan-cta" data-plan-id="${plan.id}">Wybierz pakiet</button>
    </article>
  `).join('');

  $$('.plan-cta').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.user) {
        openModal('login');
        return;
      }
      const ordersTab = document.querySelector('[data-tab="orders"]');
      if (ordersTab) {
        ordersTab.click();
        const select = $('#orderPlanId');
        if (select) select.value = btn.dataset.planId;
        document.querySelector('.dashboard-shell')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

function renderFaqs() {
  $('#faqList').innerHTML = state.faqs.map(item => `
    <article class="glass faq-item">
      <h3>${item.question}</h3>
      <p>${item.answer}</p>
    </article>
  `).join('');
}

function renderForum() {
  $('#forumPosts').innerHTML = state.forumPosts.length ? state.forumPosts.map(post => `
    <div class="row-card forum-post">
      <strong>${post.title}</strong>
      <div class="muted small">${post.full_name} • ${formatDate(post.created_at)}</div>
      <p>${post.body}</p>
    </div>
  `).join('') : '<div class="row-card">Brak wpisów. Pierwsze posty pojawią się po zalogowaniu.</div>';
}

function renderNavForUser() {
  const navActions = $('.nav-actions');
  if (!state.user) {
    navActions.innerHTML = `
      <button class="btn btn-ghost" data-open-auth="login">Zaloguj</button>
      <button class="btn btn-primary" data-open-auth="register">Zarejestruj się</button>
    `;
  } else {
    navActions.innerHTML = `
      <span class="badge">${state.user.full_name} • ${state.user.role}</span>
      <button class="btn btn-ghost" id="logoutBtn">Wyloguj</button>
    `;
    $('#logoutBtn').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.dashboard = null;
      state.adminOverview = null;
      state.superOverview = null;
      renderApp();
      showToast('Wylogowano.');
    });
  }

  $$('[data-open-auth]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.openAuth)));
}

function buildAlertBanner(user) {
  const plan = user?.clientPlan;
  if (!plan) return '';
  if (plan.active_demand_notice) {
    return `<div class="banner-alert"><strong>Wezwanie do zapłaty:</strong> Twoje konto ma aktywne wezwanie do zapłaty. Ureguluj należność, aby plan pozostał aktywny.</div>`;
  }
  if (plan.active_payment_notice || ['nieopłacony', 'wymaga płatności'].includes(plan.status)) {
    return `<div class="banner-alert"><strong>Płatność wymagana:</strong> Opłać lub przedłuż plan, aby uniknąć przerwy w obsłudze.</div>`;
  }
  return '';
}

function dashboardOverviewHTML(data) {
  const user = data.user;
  const plan = user.clientPlan;
  return `
    ${buildAlertBanner(user)}
    <div class="dashboard-grid">
      <div class="dashboard-stack">
        <section class="glass card-lg">
          <div class="panel-title">
            <h3>Mój plan</h3>
            <span class="badge">${plan?.status || 'Brak planu'}</span>
          </div>
          <div class="mini-grid">
            <div class="row-card metric"><span>Nazwa pakietu</span><strong>${plan?.plan_name_snapshot || 'Brak'}</strong></div>
            <div class="row-card metric"><span>Koszt miesięczny</span><strong>${plan ? currency(plan.monthly_price_snapshot) : '—'}</strong></div>
            <div class="row-card metric"><span>Status planu</span><strong>${plan?.status || '—'}</strong></div>
            <div class="row-card metric"><span>Data końca planu</span><strong>${formatDate(plan?.end_date)}</strong></div>
            <div class="row-card metric"><span>Termin kolejnej płatności</span><strong>${formatDate(plan?.next_payment_due)}</strong></div>
            <div class="row-card metric"><span>Portfel</span><strong>${currency(user.wallet_balance)}</strong></div>
          </div>
          <div class="hero-actions">
            <button class="btn btn-primary" id="extendPlanBtn">Przedłuż plan</button>
          </div>
        </section>
        <section class="glass card-lg">
          <div class="panel-title"><h3>Aktywne i ostatnie zamówienia</h3></div>
          <div class="table-list">
            ${(data.orders || []).slice(0, 5).map(order => `
              <div class="row-card">
                <div class="row-head"><strong>${order.server_name}</strong><span class="badge gray">${order.status}</span></div>
                <div class="muted small">Pakiet: ${order.plan_name_snapshot} • Płatność: ${order.payment_status}</div>
                <p>${order.community_needs}</p>
              </div>
            `).join('') || '<div class="row-card">Nie masz jeszcze zamówień.</div>'}
          </div>
        </section>
      </div>
      <div class="dashboard-stack">
        <section class="glass card-lg">
          <div class="panel-title"><h3>Portfel</h3></div>
          <form id="topupForm" class="inline-form">
            <input type="number" min="1" step="0.01" name="amount" placeholder="Kwota doładowania" required />
            <input name="code" placeholder="Kod bonusowy np. BONUS10" />
            <button class="btn btn-primary" type="submit">Doładuj</button>
          </form>
          <p class="muted">Aktywne kody bonusowe mogą dodać 10% więcej środków do portfela.</p>
        </section>
        <section class="glass card-lg">
          <div class="panel-title"><h3>Profil</h3></div>
          <form id="profileForm" class="inline-form">
            <input name="fullName" value="${user.full_name}" required />
            <button class="btn btn-soft" type="submit">Zapisz profil</button>
          </form>
          <div class="row-card" style="margin-top:12px;">
            <div class="muted small">E-mail</div>
            <strong>${user.email}</strong>
          </div>
        </section>
      </div>
    </div>
  `;
}

function ordersPanelHTML() {
  return `
    <section class="glass card-lg">
      <div class="panel-title"><h3>Panel zamówień</h3></div>
      <form id="orderForm" class="form-grid">
        <select id="orderPlanId" name="planId" required>
          <option value="">Wybierz pakiet</option>
          ${state.plans.map(plan => `<option value="${plan.id}">${plan.name} — ${currency(plan.price_monthly)}</option>`).join('')}
        </select>
        <input name="serverName" placeholder="Nazwa serwera / projektu" required />
        <textarea name="communityNeeds" placeholder="Opisz potrzeby swojej społeczności" required></textarea>
        <textarea name="additionalInfo" placeholder="Dodatkowe informacje do zamówienia"></textarea>
        <button class="btn btn-primary" type="submit">Złóż zamówienie</button>
      </form>
      <div class="table-list" style="margin-top:18px;">
        ${(state.dashboard.orders || []).map(order => `
          <div class="row-card">
            <div class="row-head">
              <strong>#${order.id} • ${order.server_name}</strong>
              <span class="badge gray">${order.status}</span>
            </div>
            <div class="muted small">${order.plan_name_snapshot} • ${currency(order.monthly_price_snapshot)} • płatność: ${order.payment_status}</div>
            <p>${order.community_needs}</p>
          </div>
        `).join('') || '<div class="row-card">Brak zamówień.</div>'}
      </div>
    </section>
  `;
}

function messagesPanelHTML() {
  return `
    <section class="glass card-lg">
      <div class="panel-title"><h3>Pomoc i wiadomości</h3></div>
      <form id="messageForm" class="form-grid">
        <input name="subject" placeholder="Temat wiadomości" required />
        <div></div>
        <textarea name="body" placeholder="Opisz sprawę lub pytanie" required></textarea>
        <button class="btn btn-primary" type="submit">Wyślij do obsługi</button>
      </form>
      <div class="table-list" style="margin-top:18px;">
        ${(state.dashboard.messages || []).map(msg => `
          <div class="row-card">
            <div class="row-head"><strong>${msg.subject}</strong><span class="badge gray">${msg.status}</span></div>
            <p>${msg.body}</p>
            ${msg.admin_reply ? `<div class="glass card"><strong>Odpowiedź obsługi:</strong><p>${msg.admin_reply}</p></div>` : ''}
          </div>
        `).join('') || '<div class="row-card">Brak wiadomości.</div>'}
      </div>
    </section>
  `;
}

function forumPanelHTML() {
  return `
    <section class="glass card-lg">
      <div class="panel-title"><h3>Forum / strefa społeczności</h3></div>
      <form id="forumForm" class="form-grid">
        <input name="title" placeholder="Tytuł wpisu" required />
        <div></div>
        <textarea name="body" placeholder="Treść pytania lub opinii" required></textarea>
        <button class="btn btn-primary" type="submit">Dodaj wpis</button>
      </form>
    </section>
  `;
}

function adminPanelHTML() {
  const data = state.adminOverview;
  return `
    <div class="dashboard-stack">
      <section class="glass card-lg">
        <div class="panel-title"><h3>Panel administratora</h3><span class="badge">Ograniczony dostęp</span></div>
        <p class="muted">Admin widzi tylko informacje potrzebne do obsługi zamówień i wiadomości. Adresy e-mail klientów są ukryte.</p>
      </section>
      <section class="glass card-lg">
        <div class="panel-title"><h3>Zamówienia użytkowników</h3></div>
        <div class="table-list">
          ${data.orders.map(order => `
            <div class="row-card">
              <div class="row-head"><strong>${order.full_name} • ${order.server_name}</strong><span class="badge gray">${order.status}</span></div>
              <div class="muted small">Pakiet: ${order.plan_name_snapshot} • płatność: ${order.payment_status}</div>
              <form class="inline-form add-note-form" data-order-id="${order.id}">
                <input name="note" placeholder="Dodaj notatkę wewnętrzną" required />
                <button class="btn btn-soft btn-sm">Dodaj notatkę</button>
              </form>
            </div>
          `).join('') || '<div class="row-card">Brak zamówień.</div>'}
        </div>
      </section>
      <section class="glass card-lg">
        <div class="panel-title"><h3>Wiadomości klientów</h3></div>
        <div class="table-list">
          ${data.messages.map(msg => `
            <div class="row-card">
              <div class="row-head"><strong>${msg.full_name}</strong><span class="badge gray">${msg.status}</span></div>
              <div class="muted small">${msg.subject}</div>
              <p>${msg.body}</p>
              <form class="form-grid reply-form" data-message-id="${msg.id}">
                <textarea name="reply" placeholder="Odpowiedź do klienta" required></textarea>
                <button class="btn btn-primary">Wyślij odpowiedź</button>
              </form>
            </div>
          `).join('') || '<div class="row-card">Brak wiadomości.</div>'}
        </div>
      </section>
    </div>
  `;
}

function superPanelHTML() {
  const data = state.superOverview;
  return `
    <div class="dashboard-stack">
      <section class="glass card-lg">
        <div class="panel-title"><h3>Dashboard super admina</h3><span class="badge">Pełen dostęp</span></div>
        <div class="mini-grid">
          <div class="row-card metric"><span>Portfel firmowy</span><strong>${currency(data.companyWallet.balance)}</strong></div>
          <div class="row-card metric"><span>Użytkownicy</span><strong>${data.users.length}</strong></div>
          <div class="row-card metric"><span>Pakiety</span><strong>${data.plans.length}</strong></div>
        </div>
        <form id="companyWithdrawForm" class="inline-form" style="margin-top:16px;">
          <input name="amount" type="number" step="0.01" min="1" placeholder="Kwota wypłaty z portfela firmowego" required />
          <button class="btn btn-primary">Wypłać środki</button>
        </form>
      </section>
      <section class="glass card-lg">
        <div class="panel-title"><h3>Portfele użytkowników i statusy planów</h3></div>
        <div class="table-list">
          ${data.users.map(user => `
            <div class="row-card">
              <div class="row-head"><strong>${user.full_name}</strong><span class="badge gray">${user.role}</span></div>
              <div class="muted small">${user.email} • portfel: ${currency(user.wallet_balance)}</div>
              ${user.role === 'client' ? `
                <form class="inline-form credit-wallet-form" data-user-id="${user.id}">
                  <input name="amount" type="number" step="0.01" min="1" placeholder="Dodaj środki do portfela" required />
                  <button class="btn btn-soft btn-sm">Dodaj środki</button>
                </form>
                <form class="inline-form plan-status-form" data-user-id="${user.id}">
                  <select name="status">
                    <option>aktywny</option>
                    <option>wygasający</option>
                    <option>nieopłacony</option>
                    <option>wymaga płatności</option>
                    <option>wygasły</option>
                  </select>
                  <select name="paymentNotice">
                    <option value="0">Bez alertu płatności</option>
                    <option value="1">Alert płatności</option>
                  </select>
                  <select name="demandNotice">
                    <option value="0">Bez wezwania</option>
                    <option value="1">Wezwanie do zapłaty</option>
                  </select>
                  <button class="btn btn-soft btn-sm">Zapisz status planu</button>
                </form>` : '<div class="muted small">To konto nie ma planu klienta.</div>'}
            </div>
          `).join('')}
        </div>
      </section>
      <section class="glass card-lg">
        <div class="panel-title"><h3>Pakiety i cennik</h3></div>
        <form id="newPlanForm" class="form-grid">
          <input name="name" placeholder="Nazwa pakietu" required />
          <input name="slug" placeholder="Slug np. elite" required />
          <input name="priceMonthly" type="number" step="0.01" placeholder="Cena miesięczna" required />
          <input name="description" placeholder="Krótki opis" />
          <textarea name="features" placeholder="Funkcje pakietu — każda w nowej linii"></textarea>
          <button class="btn btn-primary">Dodaj pakiet</button>
        </form>
        <div class="table-list" style="margin-top:18px;">
          ${data.plans.map(plan => `
            <div class="row-card">
              <div class="row-head"><strong>${plan.name}</strong><span class="badge gray">${currency(plan.price_monthly)}</span></div>
              <div class="muted small">slug: ${plan.slug} • aktywny: ${plan.is_active ? 'tak' : 'nie'}</div>
              <p>${plan.description || ''}</p>
              <div class="hero-actions">
                <button class="btn btn-danger btn-sm delete-plan-btn" data-plan-id="${plan.id}">Usuń plan</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
      <section class="glass card-lg">
        <div class="panel-title"><h3>Kody bonusowe</h3></div>
        <form id="discountCodeForm" class="inline-form">
          <input name="code" placeholder="Nowy kod bonusowy" required />
          <input name="bonusPercent" type="number" min="1" max="100" value="10" required />
          <button class="btn btn-primary">Dodaj kod</button>
        </form>
        <div class="table-list" style="margin-top:16px;">
          ${data.discountCodes.map(code => `<div class="row-card"><strong>${code.code}</strong><div class="muted small">bonus: ${code.bonus_percent}% • aktywny: ${code.is_active ? 'tak' : 'nie'}</div></div>`).join('')}
        </div>
      </section>
      <section class="glass card-lg">
        <div class="panel-title"><h3>Logi aktywności</h3></div>
        <div class="table-list">
          ${data.logs.map(log => `<div class="row-card"><strong>${log.action}</strong><div class="muted small">rola: ${log.actor_role || 'system'} • ${formatDate(log.created_at)}</div></div>`).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderDashboard() {
  const authGate = $('#authGate');
  const app = $('#dashboardApp');

  if (!state.user) {
    authGate.classList.remove('hidden');
    app.classList.add('hidden');
    app.innerHTML = '';
    return;
  }

  authGate.classList.add('hidden');
  app.classList.remove('hidden');

  const tabs = [
    ['overview', 'Dashboard'],
    ['orders', 'Panel zamówień'],
    ['messages', 'Pomoc'],
    ['forum', 'Forum']
  ];
  if (['admin', 'superadmin'].includes(state.user.role)) tabs.push(['admin', 'Admin']);
  if (state.user.role === 'superadmin') tabs.push(['super', 'Super admin']);

  app.innerHTML = `
    <div class="tabs">
      ${tabs.map(([id, label]) => `<button class="tab-btn ${state.activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </div>
    <div class="section-panel ${state.activeTab === 'overview' ? 'active' : ''}" id="panel-overview">${dashboardOverviewHTML(state.dashboard)}</div>
    <div class="section-panel ${state.activeTab === 'orders' ? 'active' : ''}" id="panel-orders">${ordersPanelHTML()}</div>
    <div class="section-panel ${state.activeTab === 'messages' ? 'active' : ''}" id="panel-messages">${messagesPanelHTML()}</div>
    <div class="section-panel ${state.activeTab === 'forum' ? 'active' : ''}" id="panel-forum">${forumPanelHTML()}</div>
    ${['admin', 'superadmin'].includes(state.user.role) ? `<div class="section-panel ${state.activeTab === 'admin' ? 'active' : ''}" id="panel-admin">${adminPanelHTML()}</div>` : ''}
    ${state.user.role === 'superadmin' ? `<div class="section-panel ${state.activeTab === 'super' ? 'active' : ''}" id="panel-super">${superPanelHTML()}</div>` : ''}
  `;

  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    state.activeTab = btn.dataset.tab;
    renderDashboard();
  }));

  $('#extendPlanBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/wallet/extend-plan', { method: 'POST' });
      await refreshState();
      showToast('Plan został przedłużony z portfela.');
    } catch (error) { showToast(error.message); }
  });

  $('#topupForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/wallet/topup', {
        method: 'POST',
        body: { amount: form.get('amount'), code: form.get('code') }
      });
      await refreshState();
      showToast('Portfel został doładowany.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });

  $('#profileForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/profile', { method: 'POST', body: { fullName: form.get('fullName') } });
      await refreshState();
      showToast('Profil zaktualizowany.');
    } catch (error) { showToast(error.message); }
  });

  $('#orderForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/orders', {
        method: 'POST',
        body: {
          planId: form.get('planId'),
          serverName: form.get('serverName'),
          communityNeeds: form.get('communityNeeds'),
          additionalInfo: form.get('additionalInfo')
        }
      });
      await refreshState();
      showToast('Zamówienie zostało złożone.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });

  $('#messageForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/messages', {
        method: 'POST',
        body: { subject: form.get('subject'), body: form.get('body') }
      });
      await refreshState();
      showToast('Wiadomość została wysłana.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });

  $('#forumForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/forum', {
        method: 'POST',
        body: { title: form.get('title'), body: form.get('body') }
      });
      await refreshState();
      showToast('Dodano wpis do forum.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });

  $$('.add-note-form').forEach(form => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const note = new FormData(event.target).get('note');
      await api(`/api/admin/orders/${form.dataset.orderId}/note`, { method: 'POST', body: { note } });
      showToast('Notatka została dodana.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  }));

  $$('.reply-form').forEach(form => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const reply = new FormData(event.target).get('reply');
      await api(`/api/admin/messages/${form.dataset.messageId}/reply`, { method: 'POST', body: { reply } });
      await refreshState();
      showToast('Odpowiedź została zapisana.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  }));

  $('#companyWithdrawForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const amount = new FormData(event.target).get('amount');
      await api('/api/superadmin/company-wallet/withdraw', { method: 'POST', body: { amount } });
      await refreshState();
      showToast('Wypłata z portfela firmowego zapisana.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });

  $$('.credit-wallet-form').forEach(form => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const amount = new FormData(event.target).get('amount');
      await api(`/api/superadmin/users/${form.dataset.userId}/wallet-credit`, { method: 'POST', body: { amount } });
      await refreshState();
      showToast('Dodano środki do portfela klienta.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  }));

  $$('.plan-status-form').forEach(form => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(event.target);
      await api('/api/superadmin/client-plan/status', {
        method: 'POST',
        body: {
          userId: form.dataset.userId,
          status: formData.get('status'),
          paymentNotice: formData.get('paymentNotice') === '1',
          demandNotice: formData.get('demandNotice') === '1'
        }
      });
      await refreshState();
      showToast('Status planu klienta został zapisany.');
    } catch (error) { showToast(error.message); }
  }));

  $('#newPlanForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/superadmin/plans', {
        method: 'POST',
        body: {
          name: form.get('name'),
          slug: form.get('slug'),
          priceMonthly: form.get('priceMonthly'),
          description: form.get('description'),
          features: form.get('features')
        }
      });
      await refreshState();
      showToast('Nowy pakiet został dodany.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });

  $$('.delete-plan-btn').forEach(btn => btn.addEventListener('click', async () => {
    const confirmed = confirm('Czy na pewno usunąć ten plan? Historia starych zamówień zostanie zachowana jako snapshot.');
    if (!confirmed) return;
    try {
      await api(`/api/superadmin/plans/${btn.dataset.planId}`, { method: 'DELETE' });
      await refreshState();
      showToast('Pakiet został usunięty.');
    } catch (error) { showToast(error.message); }
  }));

  $('#discountCodeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api('/api/superadmin/codes', {
        method: 'POST',
        body: { code: form.get('code'), bonusPercent: form.get('bonusPercent') }
      });
      await refreshState();
      showToast('Kod bonusowy został dodany.');
      event.target.reset();
    } catch (error) { showToast(error.message); }
  });
}

async function refreshState() {
  const boot = await api('/api/bootstrap');
  state.user = boot.user;
  state.plans = boot.plans;
  state.faqs = boot.faqs;
  state.forumPosts = boot.forumPosts;
  if (state.user) {
    state.dashboard = await api('/api/dashboard');
    if (['admin', 'superadmin'].includes(state.user.role)) {
      state.adminOverview = await api('/api/admin/overview');
    }
    if (state.user.role === 'superadmin') {
      state.superOverview = await api('/api/superadmin/overview');
    }
  }
  renderApp();
}

function renderApp() {
  renderNavForUser();
  renderPlans();
  renderFaqs();
  renderForum();
  renderDashboard();
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.target);
    await api('/api/auth/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
    closeModal();
    await refreshState();
    showToast('Zalogowano pomyślnie.');
  } catch (error) { showToast(error.message); }
});

$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.target);
    await api('/api/auth/register', {
      method: 'POST',
      body: { fullName: form.get('fullName'), email: form.get('email'), password: form.get('password') }
    });
    closeModal();
    await refreshState();
    showToast('Konto zostało utworzone.');
  } catch (error) { showToast(error.message); }
});

$('#contactForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.target);
    await api('/api/contact', {
      method: 'POST',
      body: {
        name: form.get('name'),
        email: form.get('email'),
        projectName: form.get('projectName'),
        subject: form.get('subject'),
        message: form.get('message')
      }
    });
    showToast('Wiadomość została wysłana.');
    event.target.reset();
  } catch (error) { showToast(error.message); }
});

$$('[data-close-modal]').forEach(node => node.addEventListener('click', closeModal));
$$('.auth-tab').forEach(btn => btn.addEventListener('click', () => switchAuthView(btn.dataset.authView)));
$$('[data-open-auth]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.openAuth)));

refreshState().catch((error) => showToast(error.message));
