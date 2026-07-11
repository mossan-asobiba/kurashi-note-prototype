const STORAGE_KEY = "kurashiNotePrototype:v1";
const MIGRATION_KEY = "kurashiNotePrototype:migratedFromLegacy:v2";
const days = ["月", "火", "水", "木", "金", "土", "日"];
const categories = {
  food: { label: "食費", icon: "🍙" },
  daily: { label: "日用品", icon: "🧴" },
  other: { label: "その他", icon: "💡" }
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

let state = loadState();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  currentMonthLabel: $("#current-month-label"),
  currentWeekLabel: $("#current-week-label"),
  thisWeekBtn: $("#this-week-btn"),
  budgetEmpty: $("#budget-empty"),
  budgetSummary: $("#budget-summary"),
  remainingTotal: $("#remaining-total"),
  spentTotal: $("#spent-total"),
  dailyPace: $("#daily-pace"),
  budgetMeter: $("#budget-meter"),
  paceMessage: $("#pace-message"),
  categoryList: $("#category-list"),
  mealList: $("#meal-list"),
  emptyMealState: $("#empty-meal-state"),
  shoppingList: $("#shopping-list"),
  shoppingTotal: $("#shopping-total"),
  expenseList: $("#expense-list"),
  toast: $("#toast"),
  settingsDialog: $("#settings-dialog"),
  importResult: $("#import-result"),
  budgetDialog: $("#budget-dialog"),
  expenseDialog: $("#expense-dialog"),
  mealDialog: $("#meal-dialog"),
  mealInputs: $("#meal-inputs")
};

function monthKey(date = state.currentMonth) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(date = state.currentWeek) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function weekLabel(date = state.currentWeek) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d);
  start.setDate(diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultMonthData() {
  return {
    budgets: { all: 0, food: 0, daily: 0, other: 0 },
    expenses: []
  };
}

function defaultWeekData() {
  return {
    meals: {},
    shopping: []
  };
}

function createId(prefix = "item") {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

function normalizeMonthData(month) {
  const source = month && typeof month === "object" ? month : {};
  return {
    budgets: {
      all: Number(source.budgets?.all) || 0,
      food: Number(source.budgets?.food) || 0,
      daily: Number(source.budgets?.daily) || 0,
      other: Number(source.budgets?.other) || 0
    },
    expenses: Array.isArray(source.expenses) ? source.expenses : []
  };
}

function normalizeWeekData(week) {
  const source = week && typeof week === "object" ? week : {};
  return {
    meals: source.meals && typeof source.meals === "object" ? source.meals : {},
    shopping: Array.isArray(source.shopping) ? source.shopping : []
  };
}

function ensureStateShape(targetState) {
  targetState.currentMonth = targetState.currentMonth || new Date().toISOString();
  targetState.currentWeek = targetState.currentWeek || new Date().toISOString();
  targetState.months = targetState.months && typeof targetState.months === "object" ? targetState.months : {};
  targetState.weeks = targetState.weeks && typeof targetState.weeks === "object" ? targetState.weeks : {};

  Object.keys(targetState.months).forEach((key) => {
    targetState.months[key] = normalizeMonthData(targetState.months[key]);
  });

  Object.keys(targetState.weeks).forEach((key) => {
    targetState.weeks[key] = normalizeWeekData(targetState.weeks[key]);
  });

  const currentMonth = monthKey(targetState.currentMonth);
  const currentWeek = weekKey(targetState.currentWeek);
  if (!targetState.months[currentMonth]) targetState.months[currentMonth] = defaultMonthData();
  if (!targetState.weeks[currentWeek]) targetState.weeks[currentWeek] = defaultWeekData();
  return targetState;
}

function createInitialState() {
  return {
    currentMonth: new Date().toISOString(),
    currentWeek: new Date().toISOString(),
    months: { [monthKey(new Date())]: defaultMonthData() },
    weeks: { [weekKey(new Date())]: defaultWeekData() }
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const initialState = createInitialState();
    migrateLegacyData(initialState);
    return ensureStateShape(initialState);
  }

  try {
    const parsed = JSON.parse(saved);
    if (!parsed.months) throw new Error("Invalid data");
    ensureStateShape(parsed);

    Object.entries(parsed.months).forEach(([key, month]) => {
      if (month.meals || month.shopping) {
        const week = parsed.weeks[key] || defaultWeekData();
        week.meals = week.meals || month.meals || {};
        week.shopping = week.shopping || month.shopping || [];
        parsed.weeks[key] = week;
        delete month.meals;
        delete month.shopping;
      }
    });

    migrateLegacyData(parsed);
    return ensureStateShape(parsed);
  } catch {
    const initialState = createInitialState();
    migrateLegacyData(initialState);
    return ensureStateShape(initialState);
  }
}

function migrateLegacyData(targetState, options = {}) {
  if (localStorage.getItem(MIGRATION_KEY) && !options.force) {
    return { meals: 0, shopping: 0, budgets: 0, expenses: 0 };
  }

  let imported = false;
  const counts = { meals: 0, shopping: 0, budgets: 0, expenses: 0 };

  try {
    const konda = JSON.parse(localStorage.getItem("kondaNoteAppData") || "null");
    if (konda?.weeks) {
      Object.entries(konda.weeks).forEach(([key, week]) => {
        const targetWeek = normalizeWeekData(targetState.weeks[key] || defaultWeekData());
        const legacyMeals = week.menus || week.meals || {};
        const legacyItems = week.items || week.shopping || [];
        const existingIds = new Set(targetWeek.shopping.map((item) => item.id));
        const beforeMealCount = Object.keys(targetWeek.meals).length;
        const beforeShoppingCount = targetWeek.shopping.length;
        targetWeek.meals = { ...targetWeek.meals, ...legacyMeals };
        targetWeek.shopping = [
          ...targetWeek.shopping,
          ...legacyItems.map((item) => ({
            id: item.id ? `konda-${item.id}` : createId("konda"),
            name: item.name,
            day: item.menuDay || item.day || "",
            done: Boolean(item.checked ?? item.done)
          })).filter((item) => item.name && !existingIds.has(item.id))
        ];
        counts.meals += Math.max(0, Object.keys(targetWeek.meals).length - beforeMealCount);
        counts.shopping += Math.max(0, targetWeek.shopping.length - beforeShoppingCount);
        targetState.weeks[key] = targetWeek;
      });
      imported = true;
    }
  } catch {
    // 旧データが壊れている場合は取り込みをスキップします。
  }

  try {
    const legacyExpenses = JSON.parse(localStorage.getItem("howMuchLeftExpenses") || "[]");
    const legacyBudgets = JSON.parse(localStorage.getItem("howMuchLeftBudgets") || "{}");

    if (legacyBudgets && Object.keys(legacyBudgets).length > 0) {
      const monthBudgets = legacyBudgets.all !== undefined ? { [monthKey(new Date())]: legacyBudgets } : legacyBudgets;
      Object.entries(monthBudgets).forEach(([key, budget]) => {
        const targetMonth = normalizeMonthData(targetState.months[key] || defaultMonthData());
        targetMonth.budgets = {
          all: Number(budget.all) || 0,
          food: Number(budget.food) || 0,
          daily: Number(budget.daily) || 0,
          other: Number(budget.other) || 0
        };
        targetState.months[key] = targetMonth;
        counts.budgets += 1;
      });
      imported = true;
    }

    if (Array.isArray(legacyExpenses) && legacyExpenses.length > 0) {
      legacyExpenses.forEach((expense) => {
        if (!expense.date || !expense.amount) return;
        const key = expense.date.slice(0, 7);
        const targetMonth = normalizeMonthData(targetState.months[key] || defaultMonthData());
        const expenseId = expense.id ? `left-${expense.id}` : createId("left");
        if (targetMonth.expenses.some((item) => item.id === expenseId)) return;
        targetMonth.expenses.push({
          id: expenseId,
          amount: Number(expense.amount) || 0,
          category: categories[expense.category] ? expense.category : "other",
          date: expense.date,
          memo: ""
        });
        targetState.months[key] = targetMonth;
        counts.expenses += 1;
      });
      imported = true;
    }
  } catch {
    // 旧データが壊れている場合は取り込みをスキップします。
  }

  if (imported) {
    localStorage.setItem(MIGRATION_KEY, "true");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targetState));
  }

  return counts;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentData() {
  const key = monthKey();
  if (!state.months[key]) state.months[key] = defaultMonthData();
  state.months[key] = normalizeMonthData(state.months[key]);
  return state.months[key];
}

function currentWeekData() {
  const key = weekKey();
  if (!state.weeks[key]) state.weeks[key] = defaultWeekData();
  state.weeks[key] = normalizeWeekData(state.weeks[key]);
  return state.weeks[key];
}

function setCurrentMonth(date) {
  state.currentMonth = date.toISOString();
  currentData();
  saveState();
  render();
}

function setCurrentWeek(date) {
  state.currentWeek = date.toISOString();
  currentWeekData();
  saveState();
  render();
}

function totals() {
  const data = currentData();
  const spentByCategory = { food: 0, daily: 0, other: 0 };
  data.expenses.forEach((expense) => {
    const category = categories[expense.category] ? expense.category : "other";
    spentByCategory[category] += Number(expense.amount) || 0;
  });

  const spent = Object.values(spentByCategory).reduce((sum, amount) => sum + amount, 0);
  const budget = data.budgets.all || Object.values(data.budgets).reduce((sum, amount) => sum + amount, 0);
  const remaining = Math.max(0, budget - spent);
  const date = new Date(state.currentMonth);
  const now = new Date();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const isCurrent = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const isFuture = new Date(date.getFullYear(), date.getMonth(), 1) > now;
  const daysLeft = isCurrent ? lastDay - now.getDate() + 1 : isFuture ? lastDay : 0;

  return {
    budget,
    spent,
    remaining,
    daysLeft,
    daily: daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
    ratio: budget > 0 ? spent / budget : 0,
    spentByCategory
  };
}

function render() {
  const data = currentData();
  const weekData = currentWeekData();
  const total = totals();
  const date = new Date(state.currentMonth);
  elements.currentMonthLabel.textContent = `${date.getFullYear()}年${date.getMonth() + 1}月`;
  elements.currentWeekLabel.textContent = weekLabel();
  elements.thisWeekBtn.classList.toggle("hidden", weekKey() === weekKey(new Date()));

  const hasBudget = total.budget > 0;
  elements.budgetEmpty.classList.toggle("hidden", hasBudget);
  elements.budgetSummary.classList.toggle("hidden", !hasBudget);

  if (hasBudget) {
    elements.remainingTotal.textContent = yen.format(total.remaining);
    elements.spentTotal.textContent = yen.format(total.spent);
    elements.dailyPace.textContent = yen.format(total.daily);
    elements.budgetMeter.style.width = `${Math.min(100, total.ratio * 100)}%`;
    elements.budgetMeter.style.background = total.ratio >= 0.9 ? "var(--red)" : total.ratio >= 0.7 ? "var(--yellow)" : "var(--mint)";
    elements.paceMessage.textContent =
      total.daysLeft > 0
        ? `月末まで残り${total.daysLeft}日。今日から1日${yen.format(total.daily)}くらいで過ごせます。`
        : "この月は終了しています。履歴の振り返りに使えます。";
  }

  renderCategories(data, total);
  renderMeals(weekData);
  renderShopping(weekData);
  renderExpenses(data);
}

function renderCategories(data, total) {
  elements.categoryList.innerHTML = Object.entries(categories).map(([key, category]) => {
    const budget = data.budgets[key] || 0;
    const spent = total.spentByCategory[key] || 0;
    const ratio = budget > 0 ? spent / budget : 0;
    return `
      <div class="category-row">
        <div class="row-top">
          <span class="category-name">${category.icon} ${category.label}</span>
          <strong>${yen.format(spent)} / ${yen.format(budget)}</strong>
        </div>
        <div class="small-meter"><div style="width:${Math.min(100, ratio * 100)}%; background:${ratio >= 0.9 ? "var(--red)" : ratio >= 0.7 ? "var(--yellow)" : "var(--mint)"}"></div></div>
      </div>
    `;
  }).join("");
}

function renderMeals(data) {
  const registeredDays = days.filter((day) => data.meals[day]);

  elements.emptyMealState.classList.toggle("hidden", registeredDays.length > 0);
  elements.mealList.classList.toggle("hidden", registeredDays.length === 0);

  if (registeredDays.length === 0) {
    elements.mealList.innerHTML = "";
    return;
  }

  elements.mealList.innerHTML = registeredDays.map((day) => {
    const meal = data.meals[day] || "";
    return `
      <article class="meal-card">
        <div class="meal-top">
          <span class="meal-day">${day}曜日</span>
        </div>
        <div class="meal-name">${escapeHtml(meal)}</div>
        <form class="meal-tools" data-day="${day}">
          <input type="text" name="name" placeholder="買う食材を追加">
          <button class="secondary-btn">追加</button>
        </form>
      </article>
    `;
  }).join("");
}

function renderShopping(data) {
  const pending = data.shopping.filter((item) => !item.done);
  elements.shoppingTotal.textContent = `未購入 ${pending.length}件`;

  if (data.shopping.length === 0) {
    elements.shoppingList.innerHTML = `<li class="shopping-item"><span class="item-meta">買い物リストは空です</span></li>`;
    return;
  }

  elements.shoppingList.innerHTML = data.shopping.map((item) => `
    <li class="shopping-item ${item.done ? "done" : ""}">
      <label class="item-left">
          <input type="checkbox" data-action="toggle-shopping" data-id="${item.id}" ${item.done ? "checked" : ""}>
        <span>
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-meta">${item.day ? `${escapeHtml(item.day)}曜の献立` : "直接追加"}</span>
        </span>
      </label>
      <div>
        <button class="delete-btn" data-action="delete-shopping" data-id="${item.id}" aria-label="削除">×</button>
      </div>
    </li>
  `).join("");
}

function renderExpenses(data) {
  if (data.expenses.length === 0) {
    elements.expenseList.innerHTML = `<li class="expense-item"><span class="item-meta">まだ支出がありません</span></li>`;
    return;
  }

  elements.expenseList.innerHTML = [...data.expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((expense) => `
      <li class="expense-item">
        <div>
          <strong>${(categories[expense.category] || categories.other).icon} ${(categories[expense.category] || categories.other).label}</strong>
          <div class="expense-meta">${expense.date}${expense.memo ? `・${escapeHtml(expense.memo)}` : ""}</div>
        </div>
        <div>
          <strong>${yen.format(expense.amount)}</strong>
          <button class="delete-btn" data-action="delete-expense" data-id="${expense.id}" aria-label="削除">×</button>
        </div>
      </li>
    `).join("");
}

function openBudgetDialog() {
  const data = currentData();
  $("#budget-all").value = data.budgets.all || "";
  $("#budget-food").value = data.budgets.food || "";
  $("#budget-daily").value = data.budgets.daily || "";
  $("#budget-other").value = data.budgets.other || "";
  elements.budgetDialog.showModal();
}

function openSettingsDialog() {
  elements.importResult.textContent = "";
  elements.settingsDialog.showModal();
}

function openExpenseDialog(category = "food", amount = "") {
  $("#expense-amount").value = amount;
  $("#expense-category").value = category;
  $("#expense-date").value = todayISO();
  elements.expenseDialog.showModal();
}

function openMealDialog() {
  const data = currentWeekData();
  elements.mealInputs.innerHTML = days.map((day) => `
    <label class="bulk-day-row">
      <span class="bulk-day-label">${day}</span>
      <input type="text" data-meal-input="${day}" value="${escapeAttr(data.meals[day] || "")}" placeholder="例：カレー、ハンバーグ">
    </label>
  `).join("");
  elements.mealDialog.showModal();
}

function addShoppingItem(name, day = "") {
  if (!name.trim()) return;
  currentWeekData().shopping.push({
    id: createId("shopping"),
    name: name.trim(),
    day,
    done: false
  });
  saveState();
  render();
  showToast("買い物リストに追加しました");
}

function addExpense(amount, category, date, memo = "") {
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount < 0) return;
  currentData().expenses.push({
    id: createId("expense"),
    amount: numericAmount,
    category: categories[category] ? category : "other",
    date: date || todayISO(),
    memo
  });
  saveState();
  render();
}

function importFromLocalStorage() {
  const counts = migrateLegacyData(state, { force: true });
  state = ensureStateShape(state);
  saveState();
  render();
  showImportResult(counts);
}

function readJsonInput(selector, fallback) {
  const value = $(selector).value.trim();
  if (!value) return fallback;
  return JSON.parse(value);
}

function importFromPastedData() {
  try {
    const konda = readJsonInput("#konda-import-text", null);
    const expenses = readJsonInput("#expenses-import-text", []);
    const budgets = readJsonInput("#budgets-import-text", {});

    if (konda) localStorage.setItem("kondaNoteAppData", JSON.stringify(konda));
    if (Array.isArray(expenses)) localStorage.setItem("howMuchLeftExpenses", JSON.stringify(expenses));
    if (budgets && typeof budgets === "object") localStorage.setItem("howMuchLeftBudgets", JSON.stringify(budgets));

    importFromLocalStorage();
    $("#konda-import-text").value = "";
    $("#expenses-import-text").value = "";
    $("#budgets-import-text").value = "";
  } catch {
    elements.importResult.textContent = "データの形式を確認してください。JSONとして読み込めませんでした。";
  }
}

function showImportResult(counts) {
  const total = counts.meals + counts.shopping + counts.budgets + counts.expenses;
  if (total === 0) {
    elements.importResult.textContent = "読み込める旧データが見つかりませんでした。別のURLで使っていた場合は、貼り付け読み込みを使ってください。";
    showToast("読み込めるデータがありませんでした");
    return;
  }

  elements.importResult.textContent =
    `読み込み完了：献立${counts.meals}件、買い物${counts.shopping}件、予算${counts.budgets}か月、支出${counts.expenses}件`;
  showToast("旧データを読み込みました");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  setTimeout(() => elements.toast.classList.remove("show"), 2000);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#096;");
}

$("#settings-btn").addEventListener("click", openSettingsDialog);
$("#start-budget-btn").addEventListener("click", openBudgetDialog);
$("#open-budget-btn").addEventListener("click", openBudgetDialog);
$("#settings-budget-btn").addEventListener("click", () => {
  elements.settingsDialog.close();
  openBudgetDialog();
});
$("#import-legacy-btn").addEventListener("click", importFromLocalStorage);
$("#import-pasted-btn").addEventListener("click", importFromPastedData);
$("#open-expense-btn").addEventListener("click", () => openExpenseDialog());
$("#edit-meals-btn").addEventListener("click", openMealDialog);
$("#add-first-meal-btn").addEventListener("click", openMealDialog);

$("#prev-month-btn").addEventListener("click", () => {
  const date = new Date(state.currentMonth);
  date.setMonth(date.getMonth() - 1);
  setCurrentMonth(date);
});

$("#next-month-btn").addEventListener("click", () => {
  const date = new Date(state.currentMonth);
  date.setMonth(date.getMonth() + 1);
  setCurrentMonth(date);
});

$("#prev-week-btn").addEventListener("click", () => {
  const date = new Date(state.currentWeek);
  date.setDate(date.getDate() - 7);
  setCurrentWeek(date);
});

$("#next-week-btn").addEventListener("click", () => {
  const date = new Date(state.currentWeek);
  date.setDate(date.getDate() + 7);
  setCurrentWeek(date);
});

$("#this-week-btn").addEventListener("click", () => setCurrentWeek(new Date()));

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.remove("active"));
    $$(".view").forEach((view) => view.classList.remove("active"));
    tab.classList.add("active");
    $(`#view-${tab.dataset.view}`).classList.add("active");
  });
});

$("#budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = currentData();
  data.budgets = {
    all: Number($("#budget-all").value) || 0,
    food: Number($("#budget-food").value) || 0,
    daily: Number($("#budget-daily").value) || 0,
    other: Number($("#budget-other").value) || 0
  };
  if (!data.budgets.all) {
    data.budgets.all = data.budgets.food + data.budgets.daily + data.budgets.other;
  }
  saveState();
  elements.budgetDialog.close();
  render();
  showToast("予算を保存しました");
});

$("#expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  addExpense($("#expense-amount").value, $("#expense-category").value, $("#expense-date").value);
  elements.expenseDialog.close();
  showToast("支出を保存しました");
});

$("#meal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const meals = {};
  $$("[data-meal-input]").forEach((input) => {
    if (input.value.trim()) meals[input.dataset.mealInput] = input.value.trim();
  });
  currentWeekData().meals = meals;
  saveState();
  elements.mealDialog.close();
  render();
  showToast("献立を保存しました");
});

$("#shopping-form").addEventListener("submit", (event) => {
  event.preventDefault();
  addShoppingItem($("#shopping-name").value);
  $("#shopping-name").value = "";
});

elements.mealList.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target.closest(".meal-tools");
  if (!form) return;
  addShoppingItem(form.elements.name.value, form.dataset.day);
  form.reset();
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    document.getElementById(closeButton.dataset.closeDialog).close();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const data = currentData();
  const weekData = currentWeekData();
  const { action, id } = button.dataset;

  if (action === "delete-shopping") {
    weekData.shopping = weekData.shopping.filter((item) => item.id !== id);
    showToast("削除しました");
  }

  if (action === "delete-expense") {
    data.expenses = data.expenses.filter((expense) => expense.id !== id);
    showToast("削除しました");
  }

  saveState();
  render();
});

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-action='toggle-shopping']");
  if (!checkbox) return;
  const item = currentWeekData().shopping.find((entry) => entry.id === checkbox.dataset.id);
  if (item) item.done = checkbox.checked;
  saveState();
  render();
});

render();
