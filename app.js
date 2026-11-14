const STORAGE_KEY = "moneo-finance-v1";
const PAGE_SIZE = 8;
const CATEGORY_META = {
  Food: { icon: "☕", color: "#4b8062" }, Rent: { icon: "⌂", color: "#79a685" },
  Transport: { icon: "↗", color: "#e6b18f" }, Bills: { icon: "ϟ", color: "#d9c8a9" },
  Shopping: { icon: "◇", color: "#c7d8ca" }, Health: { icon: "✚", color: "#bd9eab" },
  Entertainment: { icon: "♫", color: "#9e9abe" }, Salary: { icon: "↙", color: "#6d9e78" },
  Freelance: { icon: "✧", color: "#84a5a0" }, Other: { icon: "·", color: "#b9c1b6" },
  Groceries: { icon: "⌑", color: "#91ac7e" }, Coffee: { icon: "☕", color: "#bd987a" },
  Travel: { icon: "✈", color: "#8da9bf" }, Education: { icon: "▤", color: "#a99ec4" },
  Personal: { icon: "◉", color: "#d29c84" }
};
const DEFAULT_CATEGORIES = Object.keys(CATEGORY_META);
const COLORS = Object.values(CATEGORY_META).map(category => category.color);
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const today = new Date();
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const dateKey = (year, month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const toMinor = value => Math.round(Number(value) * 100);
const formatMoney = minor => moneyFormat.format((minor || 0) / 100);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const state = loadState();
let activeMonth = monthKey(today);
let transactionPage = 1;
let editingId = null;
let currentType = "expense";
let toastTimer;
let importRows = [];
let importHeaders = [];
let confirmCallback = null;

function seedState() {
  const year = today.getFullYear();
  const month = today.getMonth();
  const account = { id: "acct-everyday", name: "Everyday account", type: "Bank account", openingBalance: 5800000 };
  const transactions = [];
  const templates = [
    [-5, "Salary", "income", 82000, 1, "Monthly salary"], [-5, "Rent", "expense", 22000, 2, "Monthly rent"],
    [-5, "Food", "expense", 5450, 4, "Groceries & meals"], [-5, "Transport", "expense", 2100, 8, "Metro card"],
    [-4, "Bills", "expense", 3250, 11, "Electricity and internet"], [-4, "Shopping", "expense", 1890, 17, "Home essentials"],
    [-4, "Health", "expense", 1200, 22, "Pharmacy"], [-3, "Salary", "income", 82000, 1, "Monthly salary"],
    [-3, "Rent", "expense", 22000, 2, "Monthly rent"], [-3, "Food", "expense", 6100, 6, "Groceries & meals"],
    [-3, "Entertainment", "expense", 2300, 12, "Movie night"], [-3, "Transport", "expense", 1800, 18, "Cab rides"],
    [-2, "Salary", "income", 82000, 1, "Monthly salary"], [-2, "Rent", "expense", 22000, 2, "Monthly rent"],
    [-2, "Food", "expense", 5700, 5, "Groceries & meals"], [-2, "Bills", "expense", 2850, 10, "Monthly utilities"],
    [-2, "Shopping", "expense", 4250, 16, "Weekend shopping"], [-1, "Salary", "income", 82000, 1, "Monthly salary"],
    [-1, "Rent", "expense", 22000, 2, "Monthly rent"], [-1, "Food", "expense", 6400, 6, "Groceries & meals"],
    [-1, "Transport", "expense", 1650, 9, "Metro card"], [-1, "Health", "expense", 1800, 13, "Doctor visit"],
    [-1, "Entertainment", "expense", 3200, 20, "Dinner with friends"]
  ];
  templates.forEach(([offset, category, type, amount, day, note], index) => {
    const date = new Date(year, month + offset, Math.min(day, new Date(year, month + offset + 1, 0).getDate()));
    transactions.push({ id: `seed-${index}`, amount: toMinor(amount), type, category, accountId: account.id, date: dateKey(date.getFullYear(), date.getMonth(), date.getDate()), note });
  });
  if (!transactions.some(transaction => transaction.date.slice(0, 7) === monthKey(today))) {
    transactions.push({ id: "seed-this-month", amount: toMinor(82000), type: "income", category: "Salary", accountId: account.id, date: dateKey(year, month, 1), note: "Monthly salary" });
    transactions.push({ id: "seed-rent-this-month", amount: toMinor(22000), type: "expense", category: "Rent", accountId: account.id, date: dateKey(year, month, 2), note: "Monthly rent" });
    transactions.push({ id: "seed-food-this-month", amount: toMinor(6400), type: "expense", category: "Food", accountId: account.id, date: dateKey(year, month, 6), note: "Groceries & meals" });
    transactions.push({ id: "seed-transport-this-month", amount: toMinor(1650), type: "expense", category: "Transport", accountId: account.id, date: dateKey(year, month, 9), note: "Metro card" });
    transactions.push({ id: "seed-health-this-month", amount: toMinor(1800), type: "expense", category: "Health", accountId: account.id, date: dateKey(year, month, 13), note: "Pharmacy" });
  }
  const budgets = [
    { category: "Food", limit: toMinor(10000) }, { category: "Rent", limit: toMinor(24000) },
    { category: "Transport", limit: toMinor(4000) }, { category: "Shopping", limit: toMinor(6000) },
    { category: "Bills", limit: toMinor(5000) }, { category: "Health", limit: toMinor(3500) },
    { category: "Entertainment", limit: toMinor(5000) }
  ];
  return { accounts: [account], transactions, budgets, overallBudget: toMinor(60000), categories: [...DEFAULT_CATEGORIES], lastCategory: "Food" };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.transactions) && Array.isArray(saved.accounts)) return saved;
  } catch (error) {
    console.warn("Could not read saved finance data.", error);
  }
  return seedState();
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Couldn't save data in this browser. Check available storage.");
    console.error("Could not save finance data.", error);
  }
}
function categoryIcon(category) { return CATEGORY_META[category]?.icon || "·"; }
function accountById(id) { return state.accounts.find(account => account.id === id); }
function monthTransactions(month = activeMonth) {
  return state.transactions.filter(transaction => transaction.date.startsWith(month));
}
function monthTotals(month = activeMonth) {
  return monthTransactions(month).reduce((totals, transaction) => {
    totals[transaction.type] += transaction.amount;
    return totals;
  }, { income: 0, expense: 0 });
}
function expensesByCategory(month = activeMonth) {
  return monthTransactions(month).filter(transaction => transaction.type === "expense").reduce((items, transaction) => {
    items[transaction.category] = (items[transaction.category] || 0) + transaction.amount;
    return items;
  }, {});
}
function categorySpent(category, month = activeMonth) {
  return expensesByCategory(month)[category] || 0;
}
function budgetsForMonth() {
  const configured = [...state.budgets];
  if (state.overallBudget > 0) configured.unshift({ category: "Overall", limit: state.overallBudget, overall: true });
  return configured;
}
function budgetStatus(spent, limit) {
  const ratio = limit > 0 ? spent / limit : 0;
  return ratio > 1 ? "over" : ratio >= .8 ? "warning" : "on-track";
}
function formatMonth(month) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
}
function formatDate(value, options = { month: "short", day: "numeric" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", options).format(new Date(year, month - 1, day));
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function render() {
  renderDashboard();
  renderTransactions();
  renderBudgets();
  renderAccounts();
  document.getElementById("monthHeading").textContent = formatMonth(activeMonth);
  document.getElementById("monthPicker").value = activeMonth;
  document.getElementById("budgetMonthLabel").textContent = formatMonth(activeMonth);
  renderCategoryOptions();
}
function renderDashboard() {
  const totals = monthTotals();
  const savings = totals.income - totals.expense;
  const netBalance = state.accounts.reduce((sum, account) => sum + accountBalance(account), 0);
  document.getElementById("balanceValue").textContent = formatMoney(netBalance);
  document.getElementById("incomeValue").textContent = formatMoney(totals.income);
  document.getElementById("expenseValue").textContent = formatMoney(totals.expense);
  document.getElementById("savingsValue").textContent = formatMoney(savings);
  document.getElementById("savingsRate").textContent = `${totals.income ? Math.round((savings / totals.income) * 100) : 0}%`;
  document.getElementById("incomeBar").style.width = `${Math.min(100, totals.income ? 100 : 0)}%`;
  document.getElementById("expenseBar").style.width = `${Math.min(100, totals.income ? (totals.expense / totals.income) * 100 : 0)}%`;
  renderCashFlow();
  renderSpending();
  renderBudgetPreview();
  const recent = [...monthTransactions()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  document.getElementById("recentTransactions").innerHTML = recent.length ? recent.map(transaction => `
    <div class="recent-item">
      <span class="transaction-symbol">${categoryIcon(transaction.category)}</span>
      <span class="recent-copy"><strong>${escapeHTML(transaction.note || transaction.category)}</strong><small>${escapeHTML(transaction.category)} · ${formatDate(transaction.date)}</small></span>
      <span class="recent-amount ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${formatMoney(transaction.amount)}</span>
    </div>`).join("") : `<div class="empty-state"><strong>No activity this month</strong><p>Add a transaction to get started.</p></div>`;
}
function renderCashFlow() {
  const months = [];
  const [year, month] = activeMonth.split("-").map(Number);
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(year, month - 1 - offset, 1);
    months.push(monthKey(date));
  }
  const values = months.map(month => ({ ...monthTotals(month), label: formatMonth(month).slice(0, 3) }));
  const peak = Math.max(100, ...values.flatMap(item => [item.income, item.expense]));
  const width = 560, height = 190, left = 34, right = 10, top = 7, bottom = 25;
  const chartHeight = height - top - bottom, chartWidth = width - left - right;
  const y = value => top + chartHeight - (value / peak) * chartHeight;
  const points = values.map((value, index) => ({ x: left + (chartWidth * (index + .5)) / values.length, income: y(value.income), expense: y(value.expense), label: value.label }));
  const incomeLine = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.income}`).join(" ");
  const expenseLine = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.expense}`).join(" ");
  const areaPath = `${incomeLine} L${points[points.length - 1].x},${top + chartHeight} L${points[0].x},${top + chartHeight} Z`;
  const grid = [0, .33, .66, 1].map(fraction => {
    const yValue = top + chartHeight * fraction;
    return `<line class="chart-grid-line" x1="${left}" x2="${width - right}" y1="${yValue}" y2="${yValue}"/>`;
  }).join("");
  const labels = points.map(point => `<text class="chart-label" text-anchor="middle" x="${point.x}" y="${height - 5}">${point.label}</text>`).join("");
  const dots = points.map(point => `<circle cx="${point.x}" cy="${point.income}" r="3" fill="#5f9a74"/><circle cx="${point.x}" cy="${point.expense}" r="3" fill="#e9a384"/>`).join("");
  document.getElementById("cashFlowChart").innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Income and expenses for the last six months">${grid}<defs><linearGradient id="incomeFade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6ea27c" stop-opacity=".16"/><stop offset="1" stop-color="#6ea27c" stop-opacity="0"/></linearGradient></defs><path class="chart-income-bg" d="${areaPath}"/><path d="${incomeLine}" fill="none" stroke="#6ea27c" stroke-width="2"/><path d="${expenseLine}" fill="none" stroke="#eba487" stroke-width="2"/><g>${dots}</g>${labels}</svg>`;
}
function renderSpending() {
  const items = Object.entries(expensesByCategory()).sort((a, b) => b[1] - a[1]);
  const total = items.reduce((sum, item) => sum + item[1], 0);
  document.getElementById("donutTotal").textContent = formatMoney(total);
  const segments = items.length ? items.map(([name, value], index) => {
    const color = CATEGORY_META[name]?.color || COLORS[index % COLORS.length];
    return { color, value };
  }) : [{ color: "#eceee8", value: 1 }];
  let stop = 0;
  const gradient = segments.map(segment => {
    const start = stop;
    stop += (segment.value / (total || 1)) * 360;
    return `${segment.color} ${start}deg ${stop}deg`;
  }).join(",");
  document.getElementById("spendingDonut").style.background = `conic-gradient(${gradient})`;
  document.getElementById("categoryLegend").innerHTML = items.slice(0, 4).map(([name, value]) => `
    <div class="category-legend-item"><span><i style="background:${CATEGORY_META[name]?.color || "#aeb9ac"}"></i>${escapeHTML(name)}</span><strong>${total ? Math.round(value / total * 100) : 0}%</strong></div>`).join("") || `<span class="foot-muted">No expenses yet</span>`;
}
function budgetViewData() {
  const expenses = expensesByCategory();
  return budgetsForMonth().map(budget => ({
    ...budget,
    spent: budget.overall ? monthTotals().expense : expenses[budget.category] || 0,
    status: budgetStatus(budget.overall ? monthTotals().expense : expenses[budget.category] || 0, budget.limit)
  }));
}
function budgetRow(budget, compact = false) {
  const percent = budget.limit ? Math.round(budget.spent / budget.limit * 100) : 0;
  const statusText = budget.status === "over" ? "Over budget" : budget.status === "warning" ? "Almost there" : `${Math.max(0, budget.limit - budget.spent) / 100 > 0 ? formatMoney(Math.max(0, budget.limit - budget.spent)) + " left" : "On track"}`;
  const label = budget.overall ? "Overall budget" : budget.category;
  return `<div class="${compact ? "all-budget-item" : ""}">
    <div class="budget-row-top"><span class="budget-name"><span class="budget-emoji">${budget.overall ? "◈" : categoryIcon(budget.category)}</span>${escapeHTML(label)}</span><span class="budget-numbers"><strong>${formatMoney(budget.spent)}</strong> / ${formatMoney(budget.limit)}${compact && !budget.overall ? `<button class="budget-edit-button" data-edit-budget="${escapeHTML(budget.category)}" aria-label="Edit ${escapeHTML(budget.category)} budget">✎</button>` : ""}</span></div>
    <div class="progress-track"><div class="progress-fill ${budget.status}" style="width:${Math.min(100, percent)}%"></div></div>
    <div class="budget-foot"><span class="${budget.status === "over" ? "over-text" : budget.status === "warning" ? "warning-text" : ""}">${statusText}</span><span>${percent}%</span></div>
  </div>`;
}
function renderBudgetPreview() {
  const visible = budgetViewData().filter(budget => !budget.overall).slice(0, 4);
  document.getElementById("budgetPreview").innerHTML = visible.map(budget => budgetRow(budget)).join("") || `<div class="empty-state"><strong>No budgets yet</strong><p>Set a limit to start tracking your spending.</p></div>`;
}
function renderBudgets() {
  const data = budgetViewData();
  const totalLimit = data.filter(item => item.overall).reduce((sum, item) => sum + item.limit, 0);
  const spent = monthTotals().expense;
  const setCount = data.filter(item => !item.overall).length;
  document.getElementById("budgetSummary").innerHTML = `
    <div class="summary-tile"><span>Total monthly budget</span><strong>${totalLimit ? formatMoney(totalLimit) : "Not set"}</strong><small>Overall spending limit</small></div>
    <div class="summary-tile"><span>Spent this month</span><strong>${formatMoney(spent)}</strong><small>${totalLimit ? `${Math.round(spent / totalLimit * 100)}% of your overall budget` : "Set an overall limit to track progress"}</small></div>
    <div class="summary-tile"><span>Category budgets</span><strong>${setCount}</strong><small>${data.filter(item => item.status === "over" && !item.overall).length} over limit · ${data.filter(item => item.status === "warning" && !item.overall).length} near limit</small></div>`;
  const rows = data.filter(item => !item.overall);
  document.getElementById("allBudgets").innerHTML = `${data.filter(item => item.overall).map(item => budgetRow(item, true)).join("")}${rows.map(item => budgetRow(item, true)).join("")}` || `<div class="empty-state"><strong>Start with a monthly plan</strong><p>Set a budget for one or more spending categories.</p></div>`;
}
function accountBalance(account) {
  return state.transactions.filter(transaction => transaction.accountId === account.id).reduce((balance, transaction) => balance + (transaction.type === "income" ? transaction.amount : -transaction.amount), account.openingBalance || 0);
}
function renderAccounts() {
  const total = state.accounts.reduce((sum, account) => sum + accountBalance(account), 0);
  document.getElementById("accountTotal").textContent = formatMoney(total);
  document.getElementById("accountList").innerHTML = state.accounts.map(account => `
    <article class="card account-card"><div class="account-card-top"><span class="transaction-symbol">${account.type === "Cash" ? "◉" : account.type === "Credit card" ? "▣" : account.type === "Wallet" ? "▱" : "▤"}</span><span class="account-card-type">${escapeHTML(account.type)}</span></div><h3>${escapeHTML(account.name)}</h3><div class="account-card-balance">${formatMoney(accountBalance(account))}</div><div class="account-card-opening"><span>Opening balance</span><span>${formatMoney(account.openingBalance || 0)}</span></div></article>`).join("") || `<div class="empty-state"><strong>No accounts yet</strong><p>Add an account to see your balance.</p></div>`;
}
function populateSelect(element, values, firstLabel = null, current = null) {
  const previous = current ?? element.value;
  element.innerHTML = `${firstLabel ? `<option value="all">${firstLabel}</option>` : ""}${values.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("")}`;
  if ([...element.options].some(option => option.value === previous)) element.value = previous;
}
function renderCategoryOptions() {
  const categories = [...new Set([...state.categories, ...state.transactions.map(transaction => transaction.category)])].sort();
  populateSelect(document.getElementById("transactionCategory"), categories, null, editingId ? document.getElementById("transactionCategory").value : null);
  populateSelect(document.getElementById("categoryFilter"), categories, "All categories");
  const incomeCategories = new Set(["Salary", "Freelance"]);
  populateSelect(document.getElementById("budgetCategory"), ["Overall", ...categories.filter(category => !incomeCategories.has(category))]);
  const accounts = state.accounts.map(account => account.name);
  document.getElementById("transactionAccount").innerHTML = state.accounts.map(account => `<option value="${escapeHTML(account.id)}">${escapeHTML(account.name)}</option>`).join("");
  if (!accounts.length) {
    document.getElementById("transactionAccount").innerHTML = `<option value="">Add an account first</option>`;
  }
}
function filteredTransactions() {
  const query = document.getElementById("transactionSearch").value.trim().toLowerCase();
  const type = document.getElementById("typeFilter").value;
  const category = document.getElementById("categoryFilter").value;
  const selectedMonth = document.getElementById("transactionMonth").value;
  return [...state.transactions].filter(transaction =>
    (!selectedMonth || transaction.date.startsWith(selectedMonth)) &&
    (type === "all" || transaction.type === type) &&
    (category === "all" || transaction.category === category) &&
    (!query || `${transaction.note} ${transaction.category} ${accountById(transaction.accountId)?.name || ""}`.toLowerCase().includes(query))
  ).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function renderTransactions() {
  const results = filteredTransactions();
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  transactionPage = Math.min(transactionPage, totalPages);
  const pageItems = results.slice((transactionPage - 1) * PAGE_SIZE, transactionPage * PAGE_SIZE);
  document.getElementById("transactionRows").innerHTML = pageItems.map(transaction => `
    <tr>
      <td><div class="table-transaction"><span class="transaction-symbol">${categoryIcon(transaction.category)}</span><span><strong>${escapeHTML(transaction.note || transaction.category)}</strong><small>${transaction.type === "income" ? "Income" : "Expense"}</small></span></div></td>
      <td><span class="category-pill">${escapeHTML(transaction.category)}</span></td>
      <td>${escapeHTML(accountById(transaction.accountId)?.name || "—")}</td>
      <td>${formatDate(transaction.date, { month: "short", day: "numeric", year: "numeric" })}</td>
      <td class="amount-cell ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${formatMoney(transaction.amount)}</td>
      <td><div class="row-actions"><button data-edit-transaction="${escapeHTML(transaction.id)}" aria-label="Edit transaction">✎</button><button data-delete-transaction="${escapeHTML(transaction.id)}" aria-label="Delete transaction">×</button></div></td>
    </tr>`).join("");
  document.getElementById("emptyTransactions").hidden = results.length > 0;
  document.getElementById("transactionCount").textContent = results.length ? `Showing ${Math.min((transactionPage - 1) * PAGE_SIZE + 1, results.length)}–${Math.min(transactionPage * PAGE_SIZE, results.length)} of ${results.length} transactions` : "Showing 0 transactions";
  document.getElementById("pageIndicator").textContent = `${transactionPage} / ${totalPages}`;
  document.getElementById("prevPage").disabled = transactionPage <= 1;
  document.getElementById("nextPage").disabled = transactionPage >= totalPages;
}
function switchView(view) {
  document.querySelectorAll(".view-panel").forEach(panel => panel.classList.toggle("active", panel.id === `${view}View`));
  document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === view));
  document.getElementById("viewCrumb").textContent = ({ dashboard: "Overview", transactions: "Transactions", budgets: "Budgets", accounts: "Accounts" })[view] || "Overview";
  document.getElementById("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function openTransactionDialog(transaction = null) {
  editingId = transaction?.id || null;
  document.getElementById("transactionDialogTitle").textContent = transaction ? "Edit transaction" : "Add transaction";
  document.getElementById("saveTransactionButton").textContent = transaction ? "Save changes" : "Save transaction";
  document.getElementById("transactionAmount").value = transaction ? (transaction.amount / 100).toFixed(2) : "";
  document.getElementById("transactionDate").value = transaction?.date || dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  document.getElementById("transactionNote").value = transaction?.note || "";
  currentType = transaction?.type || "expense";
  document.querySelectorAll(".type-option").forEach(button => button.classList.toggle("selected", button.dataset.type === currentType));
  renderCategoryOptions();
  if (transaction) {
    document.getElementById("transactionCategory").value = transaction.category;
    document.getElementById("transactionAccount").value = transaction.accountId;
  } else {
    document.getElementById("transactionCategory").value = state.categories.includes(state.lastCategory) ? state.lastCategory : state.categories[0];
    if (state.accounts[0]) document.getElementById("transactionAccount").value = state.accounts[0].id;
  }
  document.getElementById("transactionDialog").showModal();
  setTimeout(() => document.getElementById("transactionAmount").focus(), 0);
}
function openBudgetDialog(category = "Overall") {
  renderCategoryOptions();
  document.getElementById("budgetCategory").value = category;
  const existing = category === "Overall" ? state.overallBudget : state.budgets.find(budget => budget.category === category)?.limit;
  document.getElementById("budgetAmount").value = existing ? (existing / 100).toFixed(0) : "";
  document.getElementById("budgetDialog").showModal();
}
function escapeCsv(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function exportCsv() {
  const rows = [["date", "amount", "type", "category", "account", "note"], ...state.transactions.map(transaction => [
    transaction.date, (transaction.amount / 100).toFixed(2), transaction.type, transaction.category, accountById(transaction.accountId)?.name || "", transaction.note || ""
  ])];
  downloadFile("moneo-transactions.csv", rows.map(row => row.map(escapeCsv).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  showToast("Your transaction CSV is ready.");
}
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value); value = "";
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value.length || row.length) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); }
  return rows;
}
const CSV_FIELDS = [
  ["date", "Date"], ["amount", "Amount"], ["type", "Type"], ["category", "Category"], ["note", "Note"], ["account", "Account"]
];
function guessColumn(header, field) {
  const matches = { date: ["date", "transactiondate", "posteddate"], amount: ["amount", "value", "total"], type: ["type", "transactiontype", "kind"], category: ["category", "descriptioncategory"], note: ["note", "description", "memo", "details"], account: ["account", "accountname"] };
  return header.findIndex(value => matches[field].includes(value.toLowerCase().replace(/[^a-z]/g, "")));
}
function openImportDialog(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result || ""));
    if (rows.length < 2) { showToast("This CSV doesn't contain any transaction rows."); return; }
    importHeaders = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
    importRows = rows.slice(1).map(row => importHeaders.map((_, index) => row[index] || ""));
    document.getElementById("mappingFields").innerHTML = CSV_FIELDS.map(([field, label]) => {
      const required = field === "date" || field === "amount";
      const guess = guessColumn(importHeaders, field);
      return `<label class="field-label">${label}${required ? " *" : ""}<select data-map="${field}"><option value="">${required ? "Choose column..." : "Not mapped"}</option>${importHeaders.map((header, index) => `<option value="${index}" ${guess === index ? "selected" : ""}>${escapeHTML(header)}</option>`).join("")}</select></label>`;
    }).join("");
    updateImportPreview();
    document.getElementById("importDialog").showModal();
  };
  reader.onerror = () => showToast("Couldn't read that CSV file.");
  reader.readAsText(file);
}
function mappedRow(row) {
  const map = {};
  document.querySelectorAll("[data-map]").forEach(select => { map[select.dataset.map] = select.value === "" ? -1 : Number(select.value); });
  return Object.fromEntries(CSV_FIELDS.map(([field]) => [field, map[field] >= 0 ? row[map[field]] : ""]));
}
function parseImportDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return dateKey(year, month - 1, day);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return dateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return null;
}
function parseImportAmount(value) {
  const normalized = String(value || "").replace(/[₹$£€,\s]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? toMinor(number) : null;
}
function updateImportPreview() {
  const previewRows = importRows.slice(0, 20);
  document.getElementById("previewCount").textContent = `${Math.min(importRows.length, 20)} of ${importRows.length} rows`;
  const mapped = previewRows.map(mappedRow);
  document.getElementById("importPreview").innerHTML = `<table><thead><tr><th>DATE</th><th>AMOUNT</th><th>TYPE</th><th>CATEGORY</th><th>NOTE</th></tr></thead><tbody>${mapped.map(row => `<tr><td>${escapeHTML(row.date)}</td><td>${escapeHTML(row.amount)}</td><td>${escapeHTML(row.type)}</td><td>${escapeHTML(row.category)}</td><td>${escapeHTML(row.note)}</td></tr>`).join("")}</tbody></table>`;
}
function importTransactions() {
  const required = [...document.querySelectorAll("[data-map]")].filter(select => ["date", "amount"].includes(select.dataset.map));
  if (required.some(select => select.value === "")) { showToast("Choose a date and amount column to continue."); return; }
  const keepDuplicates = document.getElementById("keepDuplicates").checked;
  const account = state.accounts[0];
  let imported = 0, skipped = 0;
  for (const rawRow of importRows) {
    const row = mappedRow(rawRow);
    const date = parseImportDate(row.date);
    const amount = parseImportAmount(row.amount);
    if (!date || amount === null) { skipped++; continue; }
    const typeValue = row.type.toLowerCase();
    const type = typeValue.includes("income") || typeValue.includes("credit") || typeValue === "in" ? "income" : "expense";
    const category = row.category.trim() || (type === "income" ? "Other" : "Other");
    const note = row.note.trim();
    const accountName = row.account.trim();
    let targetAccount = accountName ? state.accounts.find(item => item.name.toLowerCase() === accountName.toLowerCase()) : account;
    if (!targetAccount && accountName) {
      targetAccount = { id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: accountName, type: "Bank account", openingBalance: 0 };
      state.accounts.push(targetAccount);
    }
    const duplicate = state.transactions.some(item => item.date === date && item.amount === amount && (item.note || "").toLowerCase() === note.toLowerCase());
    if (duplicate && !keepDuplicates) { skipped++; continue; }
    state.transactions.push({ id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, date, amount, type, category, accountId: targetAccount?.id || "", note });
    if (!state.categories.includes(category)) state.categories.push(category);
    imported++;
  }
  persist(); render(); document.getElementById("importDialog").close();
  showToast(`Imported ${imported} transaction${imported === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}.`);
}

document.querySelectorAll(".nav-link").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-navigate]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.navigate)));
document.querySelectorAll("[data-add-transaction]").forEach(button => button.addEventListener("click", () => openTransactionDialog()));
document.getElementById("topAddButton").addEventListener("click", () => openTransactionDialog());
document.getElementById("transactionsAddButton").addEventListener("click", () => openTransactionDialog());
document.getElementById("floatingAdd").addEventListener("click", () => openTransactionDialog());
document.getElementById("monthPicker").addEventListener("change", event => { if (event.target.value) { activeMonth = event.target.value; render(); } });
document.getElementById("transactionMonth").value = activeMonth;
document.getElementById("transactionMonth").addEventListener("change", () => { transactionPage = 1; renderTransactions(); });
["transactionSearch", "typeFilter", "categoryFilter"].forEach(id => document.getElementById(id).addEventListener(id === "transactionSearch" ? "input" : "change", () => { transactionPage = 1; renderTransactions(); }));
document.getElementById("prevPage").addEventListener("click", () => { transactionPage--; renderTransactions(); });
document.getElementById("nextPage").addEventListener("click", () => { transactionPage++; renderTransactions(); });
document.getElementById("exportButton").addEventListener("click", exportCsv);
document.getElementById("importButton").addEventListener("click", () => document.getElementById("csvFile").click());
document.getElementById("csvFile").addEventListener("change", event => { const file = event.target.files[0]; if (file) openImportDialog(file); event.target.value = ""; });
document.getElementById("mobileMenu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll(".type-option").forEach(button => button.addEventListener("click", () => {
  currentType = button.dataset.type;
  document.querySelectorAll(".type-option").forEach(option => option.classList.toggle("selected", option === button));
}));
document.getElementById("transactionForm").addEventListener("submit", event => {
  event.preventDefault();
  const amount = toMinor(document.getElementById("transactionAmount").value);
  if (!Number.isFinite(amount) || amount <= 0) { showToast("Enter an amount greater than zero."); return; }
  if (!state.accounts.length) { showToast("Add an account before logging a transaction."); return; }
  const category = document.getElementById("transactionCategory").value;
  const oldCategorySpend = currentType === "expense" ? categorySpent(category) : 0;
  const oldOverallSpend = currentType === "expense" ? monthTotals().expense : 0;
  const record = {
    id: editingId || `txn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    amount, type: currentType, category,
    accountId: document.getElementById("transactionAccount").value,
    date: document.getElementById("transactionDate").value, note: document.getElementById("transactionNote").value.trim()
  };
  if (editingId) {
    const index = state.transactions.findIndex(transaction => transaction.id === editingId);
    if (index >= 0) state.transactions[index] = record;
  } else state.transactions.push(record);
  state.lastCategory = record.category;
  const alerts = [];
  if (!editingId && record.type === "expense") {
    const categoryBudget = state.budgets.find(budget => budget.category === record.category);
    if (categoryBudget) {
      const newStatus = budgetStatus(oldCategorySpend + record.amount, categoryBudget.limit);
      if (newStatus === "over" && budgetStatus(oldCategorySpend, categoryBudget.limit) !== "over") alerts.push(`${record.category} budget exceeded`);
      else if (newStatus === "warning" && budgetStatus(oldCategorySpend, categoryBudget.limit) === "on-track") alerts.push(`${record.category} budget reached 80%`);
    }
    if (state.overallBudget > 0) {
      const newStatus = budgetStatus(oldOverallSpend + record.amount, state.overallBudget);
      if (newStatus === "over" && budgetStatus(oldOverallSpend, state.overallBudget) !== "over") alerts.push("Overall budget exceeded");
      else if (newStatus === "warning" && budgetStatus(oldOverallSpend, state.overallBudget) === "on-track") alerts.push("Overall budget reached 80%");
    }
  }
  persist(); render(); document.getElementById("transactionDialog").close();
  showToast(alerts.length ? alerts.join(" · ") : editingId ? "Transaction updated." : "Transaction saved.");
  editingId = null;
});
document.getElementById("transactionRows").addEventListener("click", event => {
  const edit = event.target.closest("[data-edit-transaction]");
  const remove = event.target.closest("[data-delete-transaction]");
  if (edit) openTransactionDialog(state.transactions.find(transaction => transaction.id === edit.dataset.editTransaction));
  if (remove) {
    const transaction = state.transactions.find(item => item.id === remove.dataset.deleteTransaction);
    if (!transaction) return;
    confirmAction(() => {
      state.transactions = state.transactions.filter(item => item.id !== transaction.id);
      persist(); render(); showToast("Transaction deleted.");
    }, "Delete this transaction?", "This transaction will be removed from your local records.");
  }
});
function confirmAction(callback, title, message) {
  confirmCallback = callback;
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  document.getElementById("confirmDialog").showModal();
}
document.getElementById("confirmAction").addEventListener("click", () => {
  if (confirmCallback) confirmCallback();
  confirmCallback = null; document.getElementById("confirmDialog").close();
});
document.getElementById("setBudgetButton").addEventListener("click", () => openBudgetDialog());
document.getElementById("budgetPreview").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-budget]");
  if (button) openBudgetDialog(button.dataset.editBudget);
});
document.getElementById("allBudgets").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-budget]");
  if (button) openBudgetDialog(button.dataset.editBudget);
});
document.getElementById("budgetForm").addEventListener("submit", event => {
  event.preventDefault();
  const category = document.getElementById("budgetCategory").value;
  const limit = toMinor(document.getElementById("budgetAmount").value);
  if (!Number.isFinite(limit) || limit <= 0) { showToast("Enter a budget greater than zero."); return; }
  if (category === "Overall") state.overallBudget = limit;
  else {
    const existing = state.budgets.find(budget => budget.category === category);
    if (existing) existing.limit = limit;
    else state.budgets.push({ category, limit });
  }
  persist(); render(); document.getElementById("budgetDialog").close(); showToast("Budget updated.");
});
document.getElementById("addAccountButton").addEventListener("click", () => document.getElementById("accountDialog").showModal());
document.getElementById("jsonExportButton").addEventListener("click", () => {
  downloadFile("moneo-backup.json", JSON.stringify(state, null, 2), "application/json");
  showToast("Your JSON backup is ready.");
});
document.getElementById("clearDataButton").addEventListener("click", () => {
  confirmAction(() => {
    state.accounts = [];
    state.transactions = [];
    state.budgets = [];
    state.overallBudget = 0;
    state.categories = [...DEFAULT_CATEGORIES];
    state.lastCategory = "Food";
    persist(); render(); showToast("Local data cleared.");
  }, "Clear all local data?", "Your transactions, accounts, and budgets will be removed from this browser. This cannot be undone.");
});
document.getElementById("accountForm").addEventListener("submit", event => {
  event.preventDefault();
  state.accounts.push({
    id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: document.getElementById("accountName").value.trim(),
    type: document.getElementById("accountType").value,
    openingBalance: toMinor(document.getElementById("accountOpening").value)
  });
  persist(); render(); document.getElementById("accountDialog").close(); event.target.reset(); showToast("Account added.");
});
document.getElementById("importForm").addEventListener("submit", event => { event.preventDefault(); importTransactions(); });
document.getElementById("mappingFields").addEventListener("change", updateImportPreview);
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openTransactionDialog(); }
  if (event.key === "Escape") document.getElementById("sidebar").classList.remove("open");
});
document.querySelector(".page-heading h1").innerHTML = `${today.getHours() < 12 ? "Good morning" : today.getHours() < 18 ? "Good afternoon" : "Good evening"}, Alex <span class="wave">✳</span>`;
document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(today).toUpperCase();
if (!localStorage.getItem(STORAGE_KEY)) persist();
render();
