const STORAGE_KEY = "kurashiNotePrototype:v1";
const MIGRATION_KEY = "kurashiNotePrototype:migratedFromLegacy:v1";
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
    return initialState;
  }

  try {
    const parsed = JSON.parse(saved);
    if (!parsed.months) throw new Error("Invalid data");
    if (!parsed.weeks) parsed.weeks = {};
    if (!parsed.currentWeek) parsed.currentWeek = new Date().toISOString();

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

    const currentWeek = weekKey(parsed.currentWeek);
    if (!parsed.weeks[currentWeek]) parsed.weeks[currentWeek] = defaultWeekData();
    migrateLegacyData(parsed);
    return parsed;
  } catch {
    const initialState = createInitialState();
    migrateLegacyData(initialState);
    return initialState;
  }
}

function migrateLegacyData(targetState) {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  let imported = false;

  try {
    const konda = JSON.parse(localStorage.getItem("kondaNoteAppData") || "null");
    if (konda?.weeks) {
      Object.entries(konda.weeks).forEach(([key, week]) => {
        const targetWeek = targetState.weeks[key] || defaultWeekData();
        targetWeek.meals = { ...targetWeek.meals, ...(week.menus || {}) };
        targetWeek.shopping = [
          ...targetWeek.shopping,
          ...(week.items || []).map((item) => ({
            id: `konda-${item.id || crypto.randomUUID()}`,
            name: item.name,
            day: item.menuDay || "",
            done: Boolean(item.checked)
          })).filter((item) => item.name)
        ];
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
        const targetMonth = targetState.months[key] || defaultMonthData();
        targetMonth.budgets = {
          all: Number(budget.all) || 0,
          food: Number(budget.food) || 0,
          daily: Number(budget.daily) || 0,
          other: Number(budget.other) || 0
        };
        targetState.months[key] = targetMonth;
      });
      imported = true;
    }

    if (Array.isArray(legacyExpenses) && legacyExpenses.length > 0) {
      legacyExpenses.forEach((expense) => {
        if (!expense.date || !expense.amount) return;
        const key = expense.date.slice(0, 7);
        const targetMonth = targetState.months[key] || defaultMonthData();
        targetMonth.expenses.push({
          id: `left-${expense.id || crypto.randomUUID()}`,
          amount: Number(expense.amount) || 0,
          category: categories[expense.category] ? expense.category : "other",
          date: expense.date,
          memo: ""
        });
        targetState.months[key] = targetMonth;
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
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentData() {
  const key = monthKey();
  if (!state.months[key]) state.months[key] = defaultMonthData();
  return state.months[key];
}

function currentWeekData() {
  const key = weekKey();
  if (!state.weeks[key]) state.weeks[key] = defaultWeekData();
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
    spentByCategory[expense.category] += expense.amount;
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
        <div class="meal-name">${meal}</div>
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
          <span class="item-meta">${item.day ? `${item.day}曜の献立` : "直接追加"}</span>
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
          <strong>${categories[expense.category].icon} ${categories[expense.category].label}</strong>
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
    amount: numericAmount,
    category,
    date,
    memo
  });
  saveState();
  render();
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

$("#settings-btn").addEventListener("click", openBudgetDialog);
$("#start-budget-btn").addEventListener("click", openBudgetDialog);
$("#open-budget-btn").addEventListener("click", openBudgetDialog);
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
