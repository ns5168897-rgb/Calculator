// Smart Calculator
// Concepts: DOM manipulation, event delegation, keyboard events, string handling,
// recursive descent parser (no eval!), error handling, localStorage, dark mode.

/* ---------- Calculator engine ---------- */
// Grammar (follows BODMAS):
//   expression := term (("+" | "-") term)*
//   term       := factor (("×" | "÷") factor)*
//   factor     := ("-" | "+") factor | postfix
//   postfix    := primary ("%")*
//   primary    := number | "(" expression ")"

function tokenize(expr) {
  return expr.match(/\d+\.?\d*|\.\d+|[+\-×÷()%]/g) || [];
}

function evaluate(expr) {
  const tokens = tokenize(expr);
  if (tokens.join("") !== expr) throw new Error("Invalid expression");

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpression() {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === "×" || peek() === "÷") {
      const op = next();
      const right = parseFactor();
      if (op === "÷") {
        if (right === 0) throw new Error("Cannot divide by zero");
        value = value / right;
      } else {
        value = value * right;
      }
    }
    return value;
  }

  function parseFactor() {
    if (peek() === "-") { next(); return -parseFactor(); }
    if (peek() === "+") { next(); return parseFactor(); }
    return parsePostfix();
  }

  function parsePostfix() {
    let value = parsePrimary();
    while (peek() === "%") { next(); value = value / 100; }
    return value;
  }

  function parsePrimary() {
    const token = next();
    if (token === undefined) throw new Error("Invalid expression");
    if (token === "(") {
      const value = parseExpression();
      if (next() !== ")") throw new Error("Missing closing bracket");
      return value;
    }
    const number = Number(token);
    if (Number.isNaN(number)) throw new Error("Invalid expression");
    return number;
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error("Invalid expression");
  return Number(result.toPrecision(12)); // fixes 0.1 + 0.2 = 0.30000000000000004
}

// Makes an unfinished expression valid for live preview: removes trailing operators and closes brackets
function prepareForPreview(expr) {
  let text = expr;
  while (text.length > 0 && "+-×÷(".includes(text[text.length - 1])) {
    text = text.slice(0, -1);
  }
  const open = (text.match(/\(/g) || []).length;
  const close = (text.match(/\)/g) || []).length;
  return text === "" ? null : text + ")".repeat(Math.max(0, open - close));
}

/* ---------- UI ---------- */
const OPERATORS = "+-×÷";
const HISTORY_KEY = "calc-history";
const THEME_KEY = "calc-theme";

const displayEl = document.getElementById("display");
const previewEl = document.getElementById("preview");
const keypad = document.getElementById("keypad");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const historyToggle = document.getElementById("history-toggle");
const clearHistoryBtn = document.getElementById("clear-history");
const themeToggle = document.getElementById("theme-toggle");

let expression = "";
let lastExpression = "";
let justEvaluated = false;
let hasError = false;
let history = loadHistory();

function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

const lastChar = () => expression.slice(-1);
const lastNumber = () => (expression.match(/[\d.]*$/) || [""])[0];
const isDigit = (ch) => ch >= "0" && ch <= "9";

function resetIfNeeded() {
  if (hasError || justEvaluated) {
    expression = "";
    hasError = false;
    justEvaluated = false;
  }
}

/* ---------- Input actions ---------- */
function inputDigit(digit) {
  resetIfNeeded();
  if (lastChar() === ")" || lastChar() === "%") return;
  const current = lastNumber();
  if (current === "0") {
    if (digit === "0") return;
    expression = expression.slice(0, -1) + digit; // replace leading 0
  } else {
    expression += digit;
  }
  update();
}

function inputDot() {
  if (hasError || justEvaluated) { expression = ""; hasError = false; justEvaluated = false; }
  if (lastChar() === ")" || lastChar() === "%") return;
  const current = lastNumber();
  if (current.includes(".")) return;
  expression += current === "" ? "0." : ".";
  update();
}

function inputOperator(op) {
  if (hasError) return;
  justEvaluated = false; // lets the user continue calculating with the result
  if (expression === "") {
    if (op === "-") expression = "-";
    update();
    return;
  }
  const last = lastChar();
  if (last === "(") {
    if (op === "-") expression += op;
  } else if (OPERATORS.includes(last)) {
    if (expression === "-") return;
    expression = expression.slice(0, -1) + op; // replace previous operator
  } else {
    expression += op;
  }
  update();
}

function inputParen(paren) {
  resetIfNeeded();
  const open = (expression.match(/\(/g) || []).length;
  const close = (expression.match(/\)/g) || []).length;
  const last = lastChar();

  if (paren === "(") {
    if (expression === "" || OPERATORS.includes(last) || last === "(") expression += "(";
  } else if (open > close && (isDigit(last) || last === ")" || last === "%")) {
    expression += ")";
  }
  update();
}

function inputPercent() {
  if (hasError) return;
  justEvaluated = false;
  const last = lastChar();
  if (isDigit(last) || last === ")" || last === "%") {
    expression += "%";
    update();
  }
}

function backspace() {
  if (hasError) { clearAll(); return; }
  justEvaluated = false;
  expression = expression.slice(0, -1);
  update();
}

function clearAll() {
  expression = "";
  lastExpression = "";
  justEvaluated = false;
  hasError = false;
  update();
}

function calculate() {
  if (expression === "" || justEvaluated || hasError) return;
  const prepared = prepareForPreview(expression);
  if (prepared === null) return;

  try {
    const result = evaluate(prepared);
    const resultText = String(result);
    addToHistory(prepared, resultText);
    lastExpression = prepared;
    expression = resultText;
    justEvaluated = true;
  } catch (error) {
    hasError = true;
    expression = error.message === "Cannot divide by zero" ? error.message : "Error";
  }
  update();
}

/* ---------- Display ---------- */
function update() {
  displayEl.textContent = expression === "" ? "0" : expression;
  displayEl.classList.toggle("error", hasError);
  displayEl.scrollLeft = displayEl.scrollWidth; // keep the latest digits visible

  if (hasError) {
    previewEl.textContent = "";
  } else if (justEvaluated) {
    previewEl.textContent = lastExpression + " =";
  } else {
    previewEl.textContent = livePreview();
  }
}

function livePreview() {
  const prepared = prepareForPreview(expression);
  // show a preview only when there is something to calculate (not just a single number)
  if (prepared === null || !/[+\-×÷%()]/.test(prepared.replace(/^-/, ""))) return "";
  try {
    return "= " + evaluate(prepared);
  } catch (error) {
    return "";
  }
}

/* ---------- History ---------- */
function addToHistory(expr, result) {
  history.unshift({ expr: expr, result: result });
  history = history.slice(0, 20); // keep the last 20 only
  saveHistory();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  historyEmpty.style.display = history.length === 0 ? "block" : "none";

  history.forEach((item) => {
    const li = document.createElement("li");
    li.title = "Click to reuse this result";

    const exprDiv = document.createElement("div");
    exprDiv.className = "h-expr";
    exprDiv.textContent = item.expr + " =";

    const resultDiv = document.createElement("div");
    resultDiv.className = "h-result";
    resultDiv.textContent = item.result;

    li.append(exprDiv, resultDiv);
    li.addEventListener("click", () => {
      expression = item.result;
      lastExpression = item.expr;
      justEvaluated = true;
      hasError = false;
      update();
    });
    historyList.appendChild(li);
  });
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, theme);
}

/* ---------- Events ---------- */
// Event delegation: one listener handles all keypad buttons
keypad.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const value = button.dataset.value;
  switch (button.dataset.action) {
    case "digit": inputDigit(value); break;
    case "dot": inputDot(); break;
    case "operator": inputOperator(value); break;
    case "paren": inputParen(value); break;
    case "percent": inputPercent(); break;
    case "backspace": backspace(); break;
    case "clear": clearAll(); break;
    case "equals": calculate(); break;
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key;
  if (isDigit(key) && key.length === 1) inputDigit(key);
  else if (key === ".") inputDot();
  else if (key === "+" || key === "-") inputOperator(key);
  else if (key === "*" || key === "x" || key === "X") inputOperator("×");
  else if (key === "/") { event.preventDefault(); inputOperator("÷"); }
  else if (key === "(" || key === ")") inputParen(key);
  else if (key === "%") inputPercent();
  else if (key === "Enter" || key === "=") { event.preventDefault(); calculate(); }
  else if (key === "Backspace") backspace();
  else if (key === "Escape" || key === "Delete") clearAll();
});

historyToggle.addEventListener("click", () => historyPanel.classList.toggle("hidden"));

clearHistoryBtn.addEventListener("click", () => {
  history = [];
  saveHistory();
  renderHistory();
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

/* ---------- Start ---------- */
const savedTheme = localStorage.getItem(THEME_KEY);
applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
renderHistory();
update();