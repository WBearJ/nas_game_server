const loginView = document.querySelector("#loginView");
const dashboardView = document.querySelector("#dashboardView");
const loginForm = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const loginError = document.querySelector("#loginError");
const gameGrid = document.querySelector("#gameGrid");
const emptyLibrary = document.querySelector("#emptyLibrary");
const libraryView = document.querySelector("#libraryView");
const addGameView = document.querySelector("#addGameView");
const catalogGrid = document.querySelector("#catalogGrid");
const addGameSetup = document.querySelector("#addGameSetup");
const openAddGameButton = document.querySelector("#openAddGameButton");
const emptyAddGameButton = document.querySelector("#emptyAddGameButton");
const backFromAddGameButton = document.querySelector("#backFromAddGameButton");
const detailView = document.querySelector("#detailView");
const detailContent = document.querySelector("#detailContent");
const backToLibraryButton = document.querySelector("#backToLibraryButton");
const refreshDetailButton = document.querySelector("#refreshDetailButton");
const globalMessage = document.querySelector("#globalMessage");
const lastUpdated = document.querySelector("#lastUpdated");
const logsButton = document.querySelector("#logsButton");
const refreshButton = document.querySelector("#refreshButton");
const logoutButton = document.querySelector("#logoutButton");
const logDialog = document.querySelector("#logDialog");
const uploadDialog = document.querySelector("#uploadDialog");
const uploadTitle = document.querySelector("#uploadTitle");
const uploadSummary = document.querySelector("#uploadSummary");
const uploadList = document.querySelector("#uploadList");
const closeUploadButton = document.querySelector("#closeUploadButton");
const confirmDialog = document.querySelector("#confirmDialog");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmMessage = document.querySelector("#confirmMessage");
const confirmCancel = document.querySelector("#confirmCancel");
const confirmAccept = document.querySelector("#confirmAccept");
const logOperationStatus = document.querySelector("#logOperationStatus");
const logOutput = document.querySelector("#logOutput");
const logFilter = document.querySelector("#logFilter");
const refreshLogsButton = document.querySelector("#refreshLogsButton");
const closeLogsButton = document.querySelector("#closeLogsButton");
const languageSelects = document.querySelectorAll(".language-select");
const i18n = window.NasI18n;
const t = (value) => i18n.translate(value);
const tt = (value) => i18n.translateText(value);

i18n.applyDocument();
for (const select of languageSelects) {
  select.value = i18n.locale;
  select.addEventListener("change", () => i18n.setLocale(select.value));
}

let sessionToken = sessionStorage.getItem("gameControlSession") || "";
sessionStorage.removeItem("gameControlToken");
let busyGame = null;
let pollTimer = null;
let logPollTimer = null;
let activeOperation = { running: false };
let activeGameId = null;
let modBusy = false;
let settingsBusy = false;
let backupSettingsBusy = false;
let activeDetailGame = null;
let detailRenderSignature = "";
let lastDetailRefresh = 0;
let gamesLoadPromise = null;
let catalogLoadPromise = null;
let detailLoadPromise = null;
let logsLoadPromise = null;
let dashboardPollInFlight = false;
let lastRenderedLogs = "";
let lastLogsPayload = null;
let preferredLogGameId = "";
const metricHistory = new Map();
const METRIC_HISTORY_LIMIT = 36;
const DETAIL_REFRESH_INTERVAL = 10000;
const clockFormatter = new Intl.DateTimeFormat(i18n.locale, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

const stateLabels = {
  running: t("运行中"),
  exited: t("已停止"),
  created: t("已停止"),
  missing: t("尚未部署"),
  paused: t("已暂停"),
  starting: t("启动中"),
  stopping: t("停止中"),
  restarting: t("启动中"),
  dead: t("异常"),
  conflict: t("需迁移"),
  unknown: t("未知")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "X-Control-Session": sessionToken,
      "X-Control-Language": i18n.locale,
      ...(options.headers || {})
    }
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = { error: t("总控返回了无法识别的响应") };
  }
  if (!response.ok) {
    const error = new Error(tt(payload.error || `请求失败：${response.status}`));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function setView(authenticated) {
  loginView.hidden = authenticated;
  dashboardView.hidden = !authenticated;
  document.documentElement.classList.remove("session-pending");
  if (!authenticated && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!authenticated) {
    closeLogs();
    closeGameDetail();
    closeAddGame();
  }
}

function setMessage(message, isError = false) {
  globalMessage.textContent = tt(message);
  globalMessage.classList.toggle("is-error", isError);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = tt(text);
  return element;
}

function fact(label, value) {
  const wrapper = document.createElement("div");
  wrapper.append(createElement("dt", "", label), createElement("dd", "", value || "—"));
  return wrapper;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = "B";
  for (const current of units) {
    amount /= 1024;
    unit = current;
    if (amount < 1024) break;
  }
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`;
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "—";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return tt(`${days} 天 ${hours} 小时`);
  if (hours) return tt(`${hours} 小时 ${minutes} 分钟`);
  return tt(`${minutes} 分钟`);
}

function formatCpu(value) {
  const cpu = Number(value || 0);
  if (cpu > 0 && cpu < 0.1) return "<0.1%";
  return `${cpu.toFixed(1)}%`;
}

function metric(label, value, key = "") {
  const wrapper = createElement("div", "game-metric");
  if (key) wrapper.dataset.metric = key;
  wrapper.append(createElement("span", "", label), createElement("strong", "", value));
  return wrapper;
}

function recordMetricSample(game) {
  if (!game?.id) return;
  const previous = metricHistory.get(game.id) || { cpu: [], memory: [], lastAt: 0 };
  const now = Date.now();
  if (now - previous.lastAt < 1000) return;
  previous.cpu.push(Number(game.metrics?.cpuPercent || 0));
  previous.memory.push(Number(game.metrics?.memoryBytes || 0));
  previous.cpu = previous.cpu.slice(-METRIC_HISTORY_LIMIT);
  previous.memory = previous.memory.slice(-METRIC_HISTORY_LIMIT);
  previous.lastAt = now;
  metricHistory.set(game.id, previous);
}

function sparkline(values, maximum, tone = "cyan") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("metric-sparkline", `tone-${tone}`);
  svg.setAttribute("viewBox", "0 0 180 48");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");

  for (const y of [16, 32]) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.classList.add("spark-grid");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "180");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    svg.append(line);
  }

  const samples = values.length ? values : [0];
  const ceiling = Math.max(Number(maximum || 0), ...samples, 1);
  const points = samples.map((sample, index) => {
    const x = samples.length === 1 ? 176 : 2 + (index / (samples.length - 1)) * 176;
    const y = 45 - Math.min(Math.max(sample / ceiling, 0), 1) * 41;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  if (points.length > 1) {
    const area = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    area.classList.add("spark-area");
    area.setAttribute("points", `0,48 ${points.join(" ")} 180,48`);
    svg.append(area);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.classList.add("spark-line");
    line.setAttribute("points", points.join(" "));
    svg.append(line);
  } else {
    const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const [x, y] = points[0].split(",");
    point.classList.add("spark-point");
    point.setAttribute("cx", x);
    point.setAttribute("cy", y);
    point.setAttribute("r", "2.5");
    svg.append(point);
  }
  return svg;
}

function activityMetric(label, value, values, maximum, tone = "cyan", detail = false, key = "") {
  const wrapper = createElement("div", `activity-metric${detail ? " detail-activity" : ""}`);
  if (key) wrapper.dataset.metric = key;
  const heading = createElement("div", "activity-heading");
  heading.append(createElement("span", "", label), createElement("strong", "", value));
  wrapper.append(heading, sparkline(values, maximum, tone));
  return wrapper;
}

function updateActivityMetric(node, value, values, maximum, tone) {
  if (!node) return;
  const valueNode = node.querySelector(".activity-heading strong");
  if (valueNode && valueNode.textContent !== value) valueNode.textContent = value;
  const currentChart = node.querySelector(".metric-sparkline");
  const nextChart = sparkline(values, maximum, tone);
  if (currentChart) currentChart.replaceWith(nextChart);
  else node.append(nextChart);
}

function setMetricValue(root, key, value) {
  const node = root.querySelector(`[data-metric="${key}"] strong`);
  if (node && node.textContent !== value) node.textContent = value;
}

function gameFeedback(game) {
  if (activeOperation.running && activeOperation.gameId === game.id) {
    return {
      kind: "activity",
      text: String(activeOperation.latestLog || activeOperation.message || "").trim()
    };
  }
  const error = String(game.error || "").trim();
  return error ? { kind: "error", text: error } : null;
}

function syncGameFeedback(card, game) {
  const feedback = gameFeedback(game);
  const node = card.querySelector(".game-feedback");
  if (!node) return;
  node.hidden = !feedback;
  node.classList.toggle("is-error", feedback?.kind === "error");
  node.classList.toggle("is-activity", feedback?.kind === "activity");
  card.classList.toggle("has-error", feedback?.kind === "error");
  card.classList.toggle("has-activity", feedback?.kind === "activity");
  if (!feedback) {
    node.replaceChildren();
    node.removeAttribute("role");
    return;
  }
  node.setAttribute("role", feedback.kind === "error" ? "alert" : "status");
  const message = createElement("p", "game-feedback-message", feedback.text);
  if (feedback.kind === "error") {
    const logs = createElement("button", "game-log-button", "查看日志");
    logs.type = "button";
    logs.addEventListener("click", () => openLogs(game.id));
    node.replaceChildren(message, logs);
  } else {
    node.replaceChildren(message);
  }
}

function actionButton(label, action, game, secondary = false) {
  const button = createElement("button", `action-button${secondary ? " secondary" : ""}`, label);
  button.type = "button";
  button.disabled = Boolean(activeOperation.running);
  button.addEventListener("click", () => runAction(game.id, action, label));
  return button;
}

function renderGameActions(actions, game) {
  if (game.state === "conflict") {
    actions.append(createElement("p", "migration-note", "请先删除同名旧容器，保留数据目录，然后刷新。"));
  } else if (game.state === "running" || game.state === "restarting") {
    actions.append(
      actionButton("停止", "stop", game, true),
      actionButton("重启", "restart", game)
    );
  } else {
    actions.append(actionButton("启动", "start", game));
  }
  const details = createElement("button", "action-button secondary", "详情");
  details.type = "button";
  details.addEventListener("click", () => openGameDetail(game.id));
  actions.append(details);
  const remove = createElement("button", "action-button danger", "删除");
  remove.type = "button";
  remove.disabled = Boolean(activeOperation.running);
  remove.addEventListener("click", () => deleteGame(game));
  actions.append(remove);
}

function renderGame(game) {
  const card = createElement("article", "game-card");
  card.dataset.gameId = game.id;
  const visual = createElement("div", "game-visual");
  visual.tabIndex = 0;
  visual.setAttribute("role", "button");
  visual.setAttribute("aria-label", tt(`查看 ${game.name} 详情`));
  visual.addEventListener("click", () => openGameDetail(game.id));
  visual.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openGameDetail(game.id);
    }
  });
  if (game.icon) {
    const image = document.createElement("img");
    image.src = game.icon;
    image.alt = tt(`${game.name} 图标`);
    image.loading = "lazy";
    visual.append(image);
  }
  const visualState = createElement("div", "visual-state");
  const visualMark = createElement("span", `status-mark${game.state === "running" ? " is-running" : ""}`);
  visualMark.setAttribute("aria-hidden", "true");
  visualState.append(visualMark, createElement("span", "state-label", stateLabels[game.state] || game.state));
  visual.append(visualState);

  const content = createElement("div", "game-content");
  const head = createElement("div", "game-card-head");
  const titleGroup = document.createElement("div");
  titleGroup.className = "game-title-link";
  titleGroup.tabIndex = 0;
  titleGroup.setAttribute("role", "button");
  titleGroup.addEventListener("click", () => openGameDetail(game.id));
  titleGroup.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openGameDetail(game.id);
    }
  });
  titleGroup.append(
    createElement("h2", "", game.name),
    createElement("p", "game-description", game.description)
  );

  const facts = createElement("dl", "game-facts");
  facts.append(
    fact("版本", game.version),
    fact("加载器", game.loader),
    fact("连接端口", game.endpoint)
  );

  head.append(titleGroup, facts);

  const history = metricHistory.get(game.id) || { cpu: [], memory: [] };
  const metrics = createElement("div", "game-metrics");
  metrics.append(
    activityMetric("CPU", formatCpu(game.metrics?.cpuPercent), history.cpu, 100, "cyan", false, "cpu"),
    activityMetric(
      "内存",
      formatBytes(game.metrics?.memoryBytes),
      history.memory,
      Number(game.metrics?.memoryLimitBytes || 0),
      "pink",
      false,
      "memory"
    ),
    metric("文件", formatBytes(game.metrics?.diskBytes), "disk")
  );

  const actions = createElement("div", "game-actions");
  renderGameActions(actions, game);
  actions.dataset.signature = `${game.state}:${Boolean(activeOperation.running)}`;
  const feedback = createElement("div", "game-feedback");
  content.append(head, metrics, actions, feedback);
  card.append(visual, content);
  syncGameFeedback(card, game);
  return card;
}

function updateGameCard(card, game) {
  const history = metricHistory.get(game.id) || { cpu: [], memory: [] };
  const mark = card.querySelector(".status-mark");
  mark?.classList.toggle("is-running", game.state === "running");
  const state = card.querySelector(".state-label");
  if (state) state.textContent = stateLabels[game.state] || game.state;
  updateActivityMetric(
    card.querySelector('[data-metric="cpu"]'),
    formatCpu(game.metrics?.cpuPercent),
    history.cpu,
    100,
    "cyan"
  );
  updateActivityMetric(
    card.querySelector('[data-metric="memory"]'),
    formatBytes(game.metrics?.memoryBytes),
    history.memory,
    Number(game.metrics?.memoryLimitBytes || 0),
    "pink"
  );
  setMetricValue(card, "disk", formatBytes(game.metrics?.diskBytes));
  syncGameFeedback(card, game);
  const actions = card.querySelector(".game-actions");
  const signature = `${game.state}:${Boolean(activeOperation.running)}`;
  if (actions?.dataset.signature !== signature) {
    actions.replaceChildren();
    renderGameActions(actions, game);
    actions.dataset.signature = signature;
  }
}

function render(payload) {
  activeOperation = payload.operation || { running: false };
  busyGame = activeOperation.running ? activeOperation.gameId : null;
  logsButton.classList.toggle("has-activity", Boolean(activeOperation.running));
  (payload.games || []).forEach(recordMetricSample);
  const games = (payload.games || []).map((game) => {
    if (!activeOperation.running || activeOperation.gameId !== game.id) return game;
    const operationState = {
      start: "starting",
      stop: "stopping",
      restart: "restarting"
    }[activeOperation.action];
    return { ...game, state: operationState || game.state };
  });
  if (!activeGameId) {
    const existing = new Map([...gameGrid.children].map((card) => [card.dataset.gameId, card]));
    const activeIds = new Set();
    for (const game of games) {
      activeIds.add(game.id);
      let card = existing.get(game.id);
      if (!card) {
        card = renderGame(game);
        gameGrid.append(card);
      } else {
        updateGameCard(card, game);
      }
    }
    for (const [gameId, card] of existing) {
      if (!activeIds.has(gameId)) card.remove();
    }
    gameGrid.hidden = games.length === 0;
    emptyLibrary.hidden = games.length !== 0;
  } else {
    const summary = games.find((game) => game.id === activeGameId);
    if (summary && activeDetailGame) {
      reconcileDetail({ ...activeDetailGame, ...summary });
    }
  }
  lastUpdated.textContent = tt(`更新于 ${clockFormatter.format(new Date())}`);
}

function renderCatalogGame(game) {
  const card = createElement("article", `catalog-card${game.added ? " is-added" : ""}`);
  card.dataset.gameId = game.id;
  const imageShell = createElement("div", "catalog-visual");
  if (game.icon) {
    const image = document.createElement("img");
    image.src = game.icon;
    image.alt = tt(`${game.name} 图标`);
    image.loading = "lazy";
    imageShell.append(image);
  }
  const content = createElement("div", "catalog-content");
  content.append(createElement("h3", "", game.name));
  const pendingSetup = Boolean(game.setup && !game.added);
  if (!pendingSetup && game.description) {
    content.append(createElement("p", "catalog-description", game.description));
  }
  if (!pendingSetup) {
    const facts = createElement("dl", "catalog-facts");
    facts.append(fact("版本", game.version), fact("加载器", game.loader), fact("连接端口", game.endpoint));
    content.append(facts);
  }
  const button = createElement(
    "button",
    `action-button${game.added ? " secondary" : ""}`,
    game.added ? "从首页移除" : game.setup ? "开始配置" : "添加到首页"
  );
  button.type = "button";
  button.addEventListener("click", () => updateLibraryGame(game, button));
  content.append(button);
  card.append(imageShell, content);
  return card;
}

function renderCatalog(payload) {
  const games = (payload.games || []).filter((game) => !game.added);
  if (!games.length) {
    catalogGrid.replaceChildren(createElement("p", "empty-state catalog-empty", "所有可用游戏都已添加。"));
    return;
  }
  catalogGrid.replaceChildren(...games.map(renderCatalogGame));
}

async function loadCatalog() {
  if (catalogLoadPromise) return catalogLoadPromise;
  catalogLoadPromise = (async () => {
    try {
      const payload = await api("/api/game-library");
      renderCatalog(payload);
      return payload;
    } catch (error) {
      setMessage(error.message, true);
      return null;
    }
  })();
  try {
    return await catalogLoadPromise;
  } finally {
    catalogLoadPromise = null;
  }
}

async function updateLibraryGame(game, button) {
  if (!game.added && game.setup) {
    await openGameSetup(game);
    return;
  }
  button.disabled = true;
  try {
    const payload = await api(`/api/game-library/${game.id}`, {
      method: game.added ? "DELETE" : "POST"
    });
    setMessage(payload.message);
    await Promise.all([loadCatalog(), loadGames({ quiet: true })]);
  } catch (error) {
    setMessage(error.message, true);
    button.disabled = false;
  }
}

function closeGameSetup() {
  if (!addGameSetup) return;
  addGameSetup.hidden = true;
  addGameSetup.replaceChildren();
  catalogGrid.hidden = false;
}

async function openGameSetup(game) {
  catalogGrid.hidden = true;
  addGameSetup.hidden = false;
  addGameSetup.replaceChildren(createElement("p", "empty-state", "正在加载配置…"));
  try {
    const payload = await api(`/api/games/${game.id}/setup`);
    renderGameSetup(game, payload);
  } catch (error) {
    addGameSetup.replaceChildren();
    const back = createElement("button", "text-button", "返回游戏库");
    back.type = "button";
    back.addEventListener("click", closeGameSetup);
    addGameSetup.append(createElement("p", "empty-state", `无法加载配置：${error.message}`), back);
    setMessage(error.message, true);
  }
}

function fillVersionSelect(select, versions, selected) {
  const items = [...versions];
  if (selected && !items.includes(selected)) items.unshift(selected);
  select.replaceChildren();
  for (const version of items) {
    const option = document.createElement("option");
    option.value = version;
    option.textContent = version;
    option.selected = version === selected;
    select.append(option);
  }
}

function bindMinecraftRuntimeFields(root, runtime) {
  const loaderInput = root.querySelector('[name="loader"]');
  const versionInput = root.querySelector('[name="mcVersion"]');
  const modsPanel = root.querySelector("[data-setup-mods]");
  if (!loaderInput || !versionInput || !runtime?.versions) return;
  const sync = () => {
    const loader = loaderInput.value;
    const versions = runtime.versions[loader] || [];
    fillVersionSelect(versionInput, versions, versionInput.value);
    if (modsPanel) {
      const info = (runtime.loaders || []).find((item) => item.id === loader);
      modsPanel.hidden = info ? !info.mods : loader === "vanilla";
    }
  };
  loaderInput.addEventListener("change", sync);
  sync();
}

function collectSettingsFrom(root) {
  const values = {};
  for (const input of root.querySelectorAll("[data-setting-type]")) {
    values[input.name] = input.dataset.settingType === "boolean" ? input.checked : input.value;
  }
  return values;
}

function collectJarFiles(fileList) {
  const jars = [];
  let rejected = false;
  for (const file of fileList || []) {
    if (file.name.toLowerCase().endsWith(".jar")) jars.push(file);
    else rejected = true;
  }
  if (rejected) setMessage("只能添加 .jar 格式的 Mod 文件", true);
  return jars;
}

function createModDropzone({ disabled = false, onFiles }) {
  const zone = createElement("label", `mod-dropzone${disabled ? " is-disabled" : ""}`);
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jar,application/java-archive";
  input.multiple = true;
  input.hidden = true;
  input.disabled = disabled;
  zone.append(
    input,
    createElement("strong", "", "拖拽 .jar 到此处，或点击选择"),
    createElement("span", "", "支持同时选择多个 Mod 文件")
  );
  const take = (list) => {
    if (disabled || input.disabled) return;
    const jars = collectJarFiles(list);
    if (jars.length) onFiles(jars);
  };
  zone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    if (!input.disabled) zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!input.disabled) zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragleave", (event) => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragover");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragover");
    take(event.dataTransfer?.files);
  });
  input.addEventListener("change", () => {
    take(input.files);
    input.value = "";
  });
  return zone;
}

function formatUploadProgress(loaded, total) {
  if (!total) return formatBytes(loaded);
  return `${formatBytes(loaded)} / ${formatBytes(total)}`;
}

function setUploadRow(row, { status, percent, detail, error = false }) {
  row.classList.toggle("is-error", error);
  row.classList.toggle("is-done", status === "完成");
  row.classList.toggle("is-active", status === "上传中");
  row.querySelector(".upload-row-status").textContent = tt(status);
  row.querySelector(".upload-row-detail").textContent = detail || "";
  row.querySelector(".upload-row-bar span").style.width = `${Math.max(0, Math.min(100, percent || 0))}%`;
}

function openUploadDialog(title, files) {
  uploadTitle.textContent = tt(title);
  uploadSummary.textContent = tt("准备上传");
  closeUploadButton.disabled = true;
  closeUploadButton.textContent = tt("关闭");
  uploadList.replaceChildren();
  const rows = files.map((file) => {
    const row = createElement("article", "upload-row");
    const identity = createElement("div", "upload-row-identity");
    identity.append(
      createElement("strong", "", file.name),
      createElement("span", "upload-row-detail", formatBytes(file.size))
    );
    const meta = createElement("div", "upload-row-meta");
    meta.append(createElement("span", "upload-row-status", "等待中"));
    const bar = createElement("div", "upload-row-bar");
    bar.append(document.createElement("span"));
    row.append(identity, meta, bar);
    uploadList.append(row);
    return row;
  });
  if (!uploadDialog.open) uploadDialog.showModal();
  return rows;
}

function closeUploadDialog() {
  if (uploadDialog.open) uploadDialog.close();
}

function uploadModFile(gameId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/games/${gameId}/mods/upload`);
    xhr.setRequestHeader("X-Control-Session", sessionToken);
    xhr.setRequestHeader("X-Control-Language", i18n.locale);
    xhr.setRequestHeader("Content-Type", "application/java-archive");
    xhr.setRequestHeader("X-Mod-Filename", encodeURIComponent(file.name));
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    xhr.addEventListener("load", () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        payload = { error: t("总控返回了无法识别的响应") };
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size, file.size);
        resolve(payload);
        return;
      }
      reject(new Error(tt(payload.error || `请求失败：${xhr.status}`)));
    });
    xhr.addEventListener("error", () => reject(new Error(t("Mod 添加失败"))));
    xhr.addEventListener("abort", () => reject(new Error(t("Mod 添加失败"))));
    xhr.send(file);
  });
}

async function startModUploads(gameId, files, rows) {
  let uploaded = 0;
  try {
    for (const [index, file] of files.entries()) {
      uploadSummary.textContent = tt(`正在上传 ${index + 1}/${files.length}：${file.name}`);
      setUploadRow(rows[index], {
        status: "上传中",
        percent: 0,
        detail: `${formatBytes(0)} / ${formatBytes(file.size)}`
      });
      await uploadModFile(gameId, file, (loaded, total) => {
        const percent = total ? Math.round((loaded / total) * 100) : 0;
        setUploadRow(rows[index], {
          status: "上传中",
          percent,
          detail: `${formatUploadProgress(loaded, total)} · ${percent}%`
        });
      });
      setUploadRow(rows[index], {
        status: "完成",
        percent: 100,
        detail: `${formatBytes(file.size)} · 100%`
      });
      uploaded += 1;
    }
    uploadSummary.textContent = tt(`已添加 ${uploaded} 个 Mod，重启服务器后生效`);
    return { uploaded };
  } catch (error) {
    const failed = rows[uploaded];
    if (failed) {
      setUploadRow(failed, {
        status: "失败",
        percent: 0,
        detail: error.message,
        error: true
      });
    }
    uploadSummary.textContent = uploaded
      ? tt(`已添加 ${uploaded} 个 Mod，后续上传失败：${error.message}`)
      : tt(`Mod 添加失败：${error.message}`);
    throw error;
  } finally {
    closeUploadButton.disabled = false;
  }
}

async function uploadModFiles(gameId, files, title = "正在上传 Mod") {
  if (!files?.length) return { uploaded: 0 };
  return startModUploads(gameId, files, openUploadDialog(title, files));
}

function renderGameSetup(game, payload) {
  const isMinecraft = game.id === "minecraft";
  const form = createElement("form", "setup-form glass-panel");
  const heading = createElement("div", "setup-heading");
  heading.append(
    createElement("p", "eyebrow", "初始化"),
    createElement("h2", "", `配置 ${game.name}`),
    createElement(
      "p",
      "section-description",
      isMinecraft
        ? "先选择加载器和游戏版本，并可同时设置常用配置、上传 Mod。"
        : "首次启动前完成常用配置；添加后仍可在详情页调整可修改项。"
    )
  );
  const fields = createElement("div", "settings-grid");
  for (const setting of payload.settings || []) fields.append(renderSettingField(setting));
  const mods = createElement("div", "setup-mods");
  mods.dataset.setupMods = "true";
  const pending = [];
  const list = createElement("div", "mod-list");
  const renderPending = () => {
    list.replaceChildren();
    if (!pending.length) {
      list.append(createElement("p", "empty-state", "还没有选择 Mod 文件。"));
      return;
    }
    for (const [index, file] of pending.entries()) {
      const row = createElement("article", "mod-row");
      const identity = createElement("div", "mod-identity");
      identity.append(createElement("strong", "", file.name), createElement("span", "", formatBytes(file.size)));
      const remove = createElement("button", "player-action secondary", "删除");
      remove.type = "button";
      remove.addEventListener("click", () => {
        pending.splice(index, 1);
        renderPending();
      });
      row.append(identity, remove);
      list.append(row);
    }
  };
  const addPending = (files) => {
    for (const file of files) {
      if (!pending.some((item) => item.name === file.name && item.size === file.size)) pending.push(file);
    }
    renderPending();
  };
  const dropzone = createModDropzone({ onFiles: addPending });
  const modsHeading = createElement("div", "panel-heading");
  const modsTitle = document.createElement("div");
  modsTitle.append(createElement("p", "eyebrow", "Mod"), createElement("h2", "", "初始化 Mod"));
  modsHeading.append(modsTitle);
  mods.append(
    modsHeading,
    createElement("p", "mod-note", "可选。原版不显示此项；模组服可在创建时上传 .jar，启动后生效。"),
    dropzone,
    list
  );
  renderPending();
  const actions = createElement("div", "setup-actions");
  const cancel = createElement("button", "action-button secondary", "返回游戏库");
  cancel.type = "button";
  cancel.addEventListener("click", closeGameSetup);
  const submit = createElement("button", "primary-button", "添加到首页");
  submit.type = "submit";
  actions.append(cancel, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    cancel.disabled = true;
    try {
      const settings = collectSettingsFrom(form);
      let rows = [];
      if (pending.length) {
        rows = openUploadDialog("正在添加游戏", pending);
        uploadSummary.textContent = tt("正在保存游戏配置");
      }
      const payloadResult = await api(`/api/game-library/${game.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      });
      let uploaded = 0;
      const loader = settings.loader || "neoforge";
      const allowMods = Boolean(payload.supportsMods)
        && payload.runtime?.loaders?.find((item) => item.id === loader)?.mods !== false
        && loader !== "vanilla";
      if (allowMods && pending.length) {
        uploadTitle.textContent = tt("正在上传 Mod");
        uploaded = (await startModUploads(game.id, pending, rows)).uploaded;
      } else if (uploadDialog.open) {
        uploadSummary.textContent = tt(payloadResult.message);
        closeUploadButton.disabled = false;
      }
      setMessage(uploaded ? `${payloadResult.message}，并已上传 ${uploaded} 个 Mod` : payloadResult.message);
      closeGameSetup();
      await Promise.all([loadCatalog(), loadGames({ quiet: true })]);
    } catch (error) {
      setMessage(error.message, true);
      submit.disabled = false;
      cancel.disabled = false;
      if (uploadDialog.open) {
        uploadSummary.textContent = error.message;
        closeUploadButton.disabled = false;
      }
    }
  });
  form.append(heading, fields);
  if (payload.supportsMods) form.append(mods);
  form.append(actions);
  addGameSetup.replaceChildren(form);
  bindMinecraftRuntimeFields(form, payload.runtime);
}

function openAddGame() {
  activeGameId = null;
  activeDetailGame = null;
  detailView.hidden = true;
  libraryView.hidden = true;
  addGameView.hidden = false;
  window.location.hash = "add-game";
  window.scrollTo({ top: 0, behavior: "smooth" });
  loadCatalog();
}

function closeAddGame() {
  const wasOpen = !addGameView.hidden;
  closeGameSetup();
  addGameView.hidden = true;
  detailView.hidden = true;
  libraryView.hidden = false;
  if (wasOpen && sessionToken) loadGames({ quiet: true });
  if (window.location.hash === "#add-game") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function detailMetric(label, value, note = "", key = "") {
  const item = createElement("div", "detail-metric");
  if (key) item.dataset.metric = key;
  item.append(createElement("span", "", label), createElement("strong", "", value));
  if (note) item.append(createElement("small", "", note));
  return item;
}

function getDetailSignature(game) {
  return JSON.stringify({
    id: game.id,
    state: game.state,
    health: game.health,
    containers: game.containers,
    players: game.players,
    world: game.world,
    serverInfo: game.serverInfo,
    configuration: game.configuration,
    settings: game.settings,
    runtimeLocked: game.runtimeLocked,
    accessLists: game.accessLists,
    features: game.features,
    managementAvailable: game.managementAvailable,
    managementError: game.managementError,
    backup: game.backup,
    mods: game.mods,
    operation: {
      running: Boolean(activeOperation.running),
      gameId: activeOperation.gameId,
      action: activeOperation.action
    },
    modBusy,
    settingsBusy,
    backupSettingsBusy
  });
}

function updateDetailMetrics(game) {
  const history = metricHistory.get(game.id) || { cpu: [], memory: [] };
  updateActivityMetric(
    detailContent.querySelector('[data-metric="cpu"]'),
    formatCpu(game.metrics?.cpuPercent),
    history.cpu,
    100,
    "cyan"
  );
  updateActivityMetric(
    detailContent.querySelector('[data-metric="memory"]'),
    formatBytes(game.metrics?.memoryBytes),
    history.memory,
    Number(game.metrics?.memoryLimitBytes || 0),
    "pink"
  );
  setMetricValue(detailContent, "disk", formatBytes(game.metrics?.diskBytes));
  setMetricValue(detailContent, "uptime", formatDuration(game.metrics?.uptimeSeconds));
}

function reconcileDetail(game) {
  activeDetailGame = game;
  const signature = getDetailSignature(game);
  if (!detailContent.childElementCount || signature !== detailRenderSignature) {
    renderDetail(game);
    detailRenderSignature = signature;
    return;
  }
  updateDetailMetrics(game);
}

function infoRow(label, value) {
  const row = createElement("div", "info-row");
  row.append(createElement("dt", "", label), createElement("dd", "", value || "—"));
  return row;
}

function detailAction(label, game, action, secondary = false) {
  const button = createElement("button", `action-button${secondary ? " secondary" : ""}`, label);
  button.type = "button";
  button.disabled = Boolean(activeOperation.running);
  button.addEventListener("click", async () => {
    await runAction(game.id, action, label);
    if (activeGameId === game.id) await loadGameDetail({ quiet: true });
  });
  return button;
}

function playerActionButton(label, gameId, player, action, secondary = true, danger = false) {
  const button = createElement("button", `player-action${secondary ? " secondary" : ""}${danger ? " danger" : ""}`, label);
  button.type = "button";
  button.addEventListener("click", () => runPlayerAction(gameId, player, action));
  return button;
}

function renderPlayer(game, player) {
  const row = createElement("article", "player-row");
  const identity = createElement("div", "player-identity");
  const nameLine = createElement("div", "player-name-line");
  nameLine.append(createElement("strong", "", player.name));
  if (game.detailType === "palworld") {
    if (player.accountName) nameLine.append(createElement("span", "player-badge secondary", player.accountName));
    identity.append(
      nameLine,
      createElement("span", "player-meta", `IP：${player.ip || t("暂不可用")}`),
      createElement("span", "player-meta", `用户 ID：${player.userId || t("暂不可用")}`),
      createElement("span", "player-meta", `等级：${player.level ?? "—"} · 延迟：${player.ping ?? "—"} ms`),
      createElement("span", "player-meta", `建筑：${player.buildingCount ?? "—"} · 坐标：${player.locationX ?? "—"}, ${player.locationY ?? "—"}`)
    );
    const actions = createElement("div", "player-actions");
    const kick = createElement("button", "player-action", "踢出");
    kick.type = "button";
    kick.disabled = !player.userId;
    kick.addEventListener("click", () => runPalworldPlayerAction(game.id, player.userId, "kick"));
    const ban = createElement("button", "player-action secondary danger", "封禁");
    ban.type = "button";
    ban.disabled = !player.userId;
    ban.addEventListener("click", () => runPalworldPlayerAction(game.id, player.userId, "ban"));
    actions.append(kick, ban);
    row.append(identity, actions);
    return row;
  }
  if (game.detailType === "terraria") {
    if (player.group) nameLine.append(createElement("span", "player-badge secondary", player.group));
    identity.append(
      nameLine,
      createElement("span", "player-meta", `IP：${player.ip || t("暂不可用")}`),
      createElement("span", "player-meta", `账号：${player.username || t("未登录 TShock 账号")}`),
      createElement("span", "player-meta", `状态：${player.state ?? "—"} · 队伍：${player.team ?? "—"}`)
    );
    const actions = createElement("div", "player-actions");
    const kick = createElement("button", "player-action", "踢出");
    kick.type = "button";
    kick.addEventListener("click", () => runTerrariaPlayerAction(game.id, player.name, "kick"));
    const ban = createElement("button", "player-action secondary danger", "封禁");
    ban.type = "button";
    ban.addEventListener("click", () => runTerrariaPlayerAction(game.id, player.name, "ban"));
    actions.append(kick, ban);
    row.append(identity, actions);
    return row;
  }
  if (game.detailType === "zomboid") {
    identity.append(
      nameLine,
      createElement("span", "player-meta", `IP：${player.ip || t("RCON 未提供")}`)
    );
    const actions = createElement("div", "player-actions");
    const kick = createElement("button", "player-action", "踢出");
    kick.type = "button";
    kick.addEventListener("click", () => runZomboidPlayerAction(game.id, player.name, "kick"));
    const ban = createElement("button", "player-action secondary danger", "封禁");
    ban.type = "button";
    ban.addEventListener("click", () => runZomboidPlayerAction(game.id, player.name, "ban"));
    actions.append(kick, ban);
    row.append(identity, actions);
    return row;
  }
  if (player.isOp) nameLine.append(createElement("span", "player-badge", "管理员"));
  if (player.isWhitelisted) nameLine.append(createElement("span", "player-badge secondary", "白名单"));
  identity.append(
    nameLine,
    createElement("span", "player-meta", `IP：${player.ip || t("日志中暂未记录")}`),
    createElement("span", "player-meta", `UUID：${player.uuid || t("暂不可用")}`),
    createElement("span", "player-meta", `本次加入：${player.joinedAt || t("暂不可用")}`)
  );
  const actions = createElement("div", "player-actions");
  actions.append(playerActionButton("踢出", game.id, player.name, "kick", false));
  actions.append(
    playerActionButton(player.isOp ? "取消管理员" : "设为管理员", game.id, player.name, player.isOp ? "deop" : "op")
  );
  actions.append(
    playerActionButton(
      player.isWhitelisted ? "移出白名单" : "加入白名单",
      game.id,
      player.name,
      player.isWhitelisted ? "whitelist-remove" : "whitelist-add"
    )
  );
  actions.append(playerActionButton("加入黑名单", game.id, player.name, "ban", true, true));
  row.append(identity, actions);
  return row;
}

function renderAccessEntry(game, entry, removeAction) {
  const row = createElement("article", "access-row");
  const identity = createElement("div", "access-identity");
  identity.append(createElement("strong", "", entry.name));
  if (entry.reason) identity.append(createElement("span", "", `原因：${entry.reason}`));
  else if (entry.uuid) identity.append(createElement("span", "", `UUID：${entry.uuid}`));
  const remove = createElement("button", "player-action secondary danger", "移除");
  remove.type = "button";
  remove.disabled = game.state !== "running" || Boolean(activeOperation.running);
  remove.addEventListener("click", () => runPlayerAction(game.id, entry.name, removeAction));
  row.append(identity, remove);
  return row;
}

function renderAccessGroup(game, label, entries, removeAction) {
  const group = createElement("section", "access-group");
  const heading = createElement("div", "access-group-heading");
  heading.append(createElement("strong", "", label), createElement("span", "", String(entries.length)));
  const list = createElement("div", "access-list");
  if (!entries.length) list.append(createElement("p", "empty-state compact", "当前名单为空。"));
  else list.append(...entries.map((entry) => renderAccessEntry(game, entry, removeAction)));
  group.append(heading, list);
  return group;
}

function renderAccessPanel(game) {
  const lists = game.accessLists || { operators: [], whitelist: [], bannedPlayers: [] };
  const panel = createElement("section", "detail-panel access-panel glass-panel");
  const heading = createElement("div", "panel-heading");
  const title = document.createElement("div");
  const total = lists.operators.length + lists.whitelist.length + lists.bannedPlayers.length;
  title.append(createElement("p", "eyebrow", "访问控制"), createElement("h2", "", "名单管理"));
  heading.append(title, createElement("strong", "panel-count", String(total)));

  const addForm = createElement("form", "access-add-form");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 16;
  nameInput.pattern = "[A-Za-z0-9_]{1,16}";
  nameInput.placeholder = t("输入 Minecraft 玩家名");
  const typeSelect = document.createElement("select");
  for (const [value, label] of [["op", "管理员"], ["whitelist-add", "白名单"], ["ban", "黑名单"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = tt(label);
    typeSelect.append(option);
  }
  const add = createElement("button", "player-action", "加入名单");
  add.type = "submit";
  const disabled = game.state !== "running" || Boolean(activeOperation.running);
  nameInput.disabled = disabled;
  typeSelect.disabled = disabled;
  add.disabled = disabled;
  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name || !nameInput.checkValidity()) {
      nameInput.reportValidity();
      return;
    }
    const completed = await runPlayerAction(game.id, name, typeSelect.value);
    if (completed) nameInput.value = "";
  });
  addForm.append(nameInput, typeSelect, add);

  const groups = createElement("div", "access-groups");
  groups.append(
    renderAccessGroup(game, "管理员", lists.operators, "deop"),
    renderAccessGroup(game, "白名单", lists.whitelist, "whitelist-remove"),
    renderAccessGroup(game, "黑名单", lists.bannedPlayers, "pardon")
  );
  const note = createElement("p", "settings-note", disabled
    ? "启动服务器后可以添加或移除名单成员。"
    : "名单修改会立即写入 Minecraft 服务器。"
  );
  panel.append(heading, addForm, groups, note);
  return panel;
}

function renderMod(gameId, mod) {
  const row = createElement("article", "mod-row");
  const identity = createElement("div", "mod-identity");
  const modified = mod.modifiedAt ? new Date(mod.modifiedAt).toLocaleString(i18n.locale) : "—";
  identity.append(
    createElement("strong", "", mod.name),
    createElement("span", "", `${formatBytes(mod.sizeBytes)} · 更新于 ${modified}`)
  );
  const remove = createElement("button", "player-action secondary", "删除");
  remove.type = "button";
  remove.disabled = modBusy;
  remove.addEventListener("click", () => deleteMod(gameId, mod.name));
  row.append(identity, remove);
  return row;
}

function renderSettingField(setting) {
  const field = createElement("label", `setting-field${setting.type === "boolean" ? " is-toggle" : ""}${setting.locked ? " is-locked" : ""}`);
  const heading = createElement("span", "setting-label", setting.label);
  if (setting.locked) {
    field.append(
      heading,
      createElement("span", "setting-locked-value", setting.value ?? "—"),
      createElement("small", "setting-hint", setting.hint || "服务器初始化后不可修改")
    );
    return field;
  }
  let input;
  if (setting.type === "select") {
    input = document.createElement("select");
    for (const option of setting.options || []) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = tt(option.label);
      item.selected = String(setting.value) === String(option.value);
      input.append(item);
    }
  } else {
    input = document.createElement("input");
    input.type = setting.type === "password" ? "password" : setting.type === "boolean" ? "checkbox" : setting.type === "integer" || setting.type === "number" ? "number" : "text";
    if (setting.type === "boolean") {
      input.checked = Boolean(setting.value);
    } else {
      input.value = setting.value ?? "";
      if (setting.type === "password" && setting.configured) input.placeholder = t("已设置，留空保持不变");
      if (setting.min != null) input.min = setting.min;
      if (setting.max != null) input.max = setting.max;
      if (setting.step != null) input.step = setting.step;
      if (setting.maxLength != null) input.maxLength = setting.maxLength;
      if (setting.pattern) input.pattern = setting.pattern;
    }
  }
  input.name = setting.key;
  input.disabled = settingsBusy || Boolean(activeOperation.running);
  input.dataset.settingType = setting.type;
  const control = createElement("span", "setting-control");
  control.append(input);
  if (setting.type === "boolean") control.append(createElement("span", "setting-switch"));
  if (setting.suffix) control.append(createElement("span", "setting-suffix", setting.suffix));
  field.append(heading, control);
  if (setting.type === "password" && setting.configured) {
    const clearLabel = createElement("label", "setting-clear-secret");
    const clearInput = document.createElement("input");
    clearInput.type = "checkbox";
    clearInput.dataset.clearPassword = setting.key;
    clearLabel.append(clearInput, document.createTextNode(t("清除现有密码")));
    field.append(clearLabel);
  }
  if (setting.hint) field.append(createElement("small", "setting-hint", setting.hint));
  return field;
}

function renderSettingsPanel(game) {
  const panel = createElement("section", "detail-panel configuration-panel glass-panel");
  const form = createElement("form", "settings-form");
  const heading = createElement("div", "panel-heading settings-heading");
  const title = document.createElement("div");
  title.append(createElement("p", "eyebrow", "服务器"), createElement("h2", "", "常用配置"));
  const save = createElement("button", "player-action", activeOperation.running ? "操作进行中" : "保存并应用");
  save.type = "submit";
  save.disabled = settingsBusy || Boolean(activeOperation.running) || !game.settings?.length;
  heading.append(title, save);
  const fields = createElement("div", "settings-grid");
  for (const setting of game.settings || []) fields.append(renderSettingField(setting));
  if (!game.settings?.length) fields.append(createElement("p", "empty-state", "当前游戏没有可编辑配置。"));
  const note = createElement("p", "settings-note", game.state === "running"
    ? "保存时会先保存世界，再重建并重新启动服务器；世界、模组和备份不会被删除。"
    : "保存后会重建已有容器；如果尚未部署，将在首次启动时应用。"
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (settingsBusy) return;
    const values = {};
    for (const input of form.querySelectorAll("[data-setting-type]")) {
      values[input.name] = input.dataset.settingType === "boolean" ? input.checked : input.value;
    }
    for (const input of form.querySelectorAll("[data-clear-password]")) {
      if (input.checked) values[input.dataset.clearPassword] = null;
    }
    await saveGameSettings(game.id, values);
  });
  form.append(heading, fields, note);
  panel.append(form);
  bindMinecraftRuntimeFields(form, game.runtime);
  return panel;
}

async function uploadMods(gameId, files) {
  if (modBusy || !files?.length) return;
  modBusy = true;
  try {
    const result = await uploadModFiles(gameId, files);
    setMessage(result.uploaded > 1
      ? `已添加 ${result.uploaded} 个 Mod，重启服务器后生效`
      : `已添加 ${files[0].name}，重启服务器后生效`);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    modBusy = false;
    if (activeGameId === gameId) await loadGameDetail({ quiet: true });
  }
}

async function deleteMod(gameId, filename) {
  if (modBusy || !window.confirm(tt(`确定删除 Mod“${filename}”吗？`))) return;
  modBusy = true;
  setMessage(`正在删除 ${filename}`);
  try {
    const payload = await api(`/api/games/${gameId}/mods/${encodeURIComponent(filename)}`, {
      method: "DELETE"
    });
    setMessage(payload.message);
  } catch (error) {
    setMessage(`Mod 删除失败：${error.message}`, true);
  } finally {
    modBusy = false;
    if (activeGameId === gameId) await loadGameDetail({ quiet: true });
  }
}

function renderDetail(game) {
  const hero = createElement("section", "detail-hero glass-panel");
  const visual = createElement("div", "detail-cover");
  if (game.icon) {
    const image = document.createElement("img");
    image.src = game.icon;
    image.alt = tt(`${game.name} 图标`);
    visual.append(image);
  }
  const copy = createElement("div", "detail-copy");
  const status = createElement("div", "visual-state detail-status");
  status.append(
    createElement("span", `status-mark${game.state === "running" ? " is-running" : ""}`),
    document.createTextNode(stateLabels[game.state] || game.state)
  );
  copy.append(
    createElement("p", "eyebrow", "服务器详情"),
    createElement("h1", "", game.name),
    createElement("p", "detail-description", `${game.description} · ${game.version} · ${game.loader}`),
    status
  );
  const heroActions = createElement("div", "detail-hero-actions");
  if (game.state === "running") {
    heroActions.append(
      detailAction("停止", game, "stop", true),
      detailAction("重启", game, "restart"),
      detailAction("保存世界", game, "save", true)
    );
  } else {
    heroActions.append(detailAction("启动", game, "start"));
  }
  heroActions.append(detailAction("立即备份", game, "backup", true));
  const logButton = createElement("button", "action-button secondary", "查看日志");
  logButton.type = "button";
  logButton.addEventListener("click", () => openLogs(game.id));
  heroActions.append(logButton);
  hero.append(visual, copy, heroActions);

  const history = metricHistory.get(game.id) || { cpu: [], memory: [] };
  const metrics = createElement("section", "detail-metrics");
  metrics.append(
    activityMetric("CPU", formatCpu(game.metrics?.cpuPercent), history.cpu, 100, "cyan", true, "cpu"),
    activityMetric(
      "内存",
      formatBytes(game.metrics?.memoryBytes),
      history.memory,
      Number(game.metrics?.memoryLimitBytes || 0),
      "pink",
      true,
      "memory"
    ),
    detailMetric("总文件", formatBytes(game.metrics?.diskBytes), "游戏数据与备份", "disk"),
    detailMetric("运行时间", formatDuration(game.metrics?.uptimeSeconds), "本次容器启动后", "uptime")
  );

  const playersPanel = createElement("section", "detail-panel players-panel glass-panel");
  const playersHeader = createElement("div", "panel-heading");
  const playerCount = `${game.players?.online || 0} / ${game.players?.max || game.world?.maxPlayers || 0}`;
  playersHeader.append(
    createElement("div", "", ""),
    createElement("strong", "panel-count", playerCount)
  );
  playersHeader.firstChild.append(
    createElement("p", "eyebrow", "在线玩家"),
    createElement("h2", "", "玩家管理")
  );
  const playerList = createElement("div", "player-list");
  if (game.managementError) {
    playerList.append(createElement("p", "empty-state", `管理接口正在准备：${tt(game.managementError)}`));
  } else if (!game.players?.players?.length) {
    playerList.append(createElement("p", "empty-state", game.state === "running" ? "当前没有可识别的在线玩家。" : "服务器停止时无法读取在线玩家。"));
  } else {
    playerList.append(...game.players.players.map((player) => renderPlayer(game, player)));
  }
  if (game.players && !game.players.listComplete) {
    playerList.append(createElement("p", "player-note", "服务器状态隐藏了部分玩家名称，在线总数仍然准确。"));
  }
  playersPanel.append(playersHeader, playerList);

  const modsPanel = createElement("section", "detail-panel mods-panel glass-panel");
  const modsHeading = createElement("div", "panel-heading");
  const modsTitle = document.createElement("div");
  modsTitle.append(createElement("p", "eyebrow", game.loader || "Mod"), createElement("h2", "", "Mod 管理"));
  const modsActions = createElement("div", "mods-heading-actions");
  modsActions.append(createElement("strong", "panel-count", String(game.mods?.length || 0)));
  modsHeading.append(modsTitle, modsActions);
  const modList = createElement("div", "mod-list");
  if (!game.mods?.length) {
    modList.append(createElement("p", "empty-state", "当前没有已安装的 Mod。"));
  } else {
    modList.append(...game.mods.map((mod) => renderMod(game.id, mod)));
  }
  modsPanel.append(
    modsHeading,
    createElement("p", "mod-note", "添加或删除后需要重启 Minecraft 服务器才能生效。"),
    createModDropzone({ disabled: modBusy, onFiles: (files) => uploadMods(game.id, files) }),
    modList
  );

  const worldPanel = createElement("section", "detail-panel glass-panel");
  const worldHeading = createElement("div", "panel-heading");
  worldHeading.append(createElement("div", "", ""));
  worldHeading.firstChild.append(
    createElement("p", "eyebrow", game.detailType === "palworld" ? "服务器" : "世界"),
    createElement("h2", "", game.world?.name || (game.detailType === "palworld" ? "幻兽帕鲁" : "world"))
  );
  const worldFacts = createElement("dl", "detail-info");
  if (game.detailType === "palworld") {
    worldFacts.append(
      infoRow("服务端版本", game.serverInfo?.version),
      infoRow("世界 GUID", game.serverInfo?.worldGuid),
      infoRow("世界天数", game.world?.days),
      infoRow("服务器 FPS", game.world?.serverFps),
      infoRow("帧耗时", game.world?.frameTime == null ? "—" : `${game.world.frameTime} ms`),
      infoRow("连接地址", `${window.location.hostname}:${game.port}`),
      infoRow("协议", "UDP")
    );
  } else if (game.detailType === "terraria") {
    worldFacts.append(
      infoRow("世界大小", game.world?.size),
      infoRow("难度", game.world?.difficulty),
      infoRow("最大玩家", game.world?.maxPlayers),
      infoRow("服务名称", game.serverInfo?.name),
      infoRow("连接地址", `${window.location.hostname}:${game.port}`),
      infoRow("协议", "TCP"),
      infoRow("管理组件", "TShock")
    );
  } else if (game.detailType === "zomboid") {
    worldFacts.append(
      infoRow("服务端版本", game.serverInfo?.version),
      infoRow("地图", game.world?.map),
      infoRow("最大玩家", game.world?.maxPlayers),
      infoRow("PvP", game.world?.pvp),
      infoRow("无人时暂停", game.world?.pauseOnEmpty),
      infoRow("公开服务器", game.world?.publicServer),
      infoRow("自动保存", game.world?.autosave == null ? "—" : `${game.world.autosave} 分钟`),
      infoRow("Java 内存", game.world?.maxRam),
      infoRow("连接地址", `${window.location.hostname}:${game.port}`),
      infoRow("协议", "UDP")
    );
  } else {
    worldFacts.append(
      infoRow("游戏模式", game.world?.gamemode),
      infoRow("难度", game.world?.difficulty),
      infoRow("最大玩家", game.world?.maxPlayers),
      infoRow("视距", game.world?.viewDistance),
      infoRow("模拟距离", game.world?.simulationDistance),
      infoRow("在线验证", game.world?.onlineMode === "true" ? "开启" : game.world?.onlineMode === "false" ? "关闭" : "—"),
      infoRow("白名单", game.world?.whitelistEnabled === "true" ? "开启" : "关闭"),
      infoRow("连接地址", `${window.location.hostname}:${game.port}`)
    );
  }
  worldPanel.append(worldHeading, worldFacts);

  const configurationPanel = renderSettingsPanel(game);

  const announcePanel = createElement("section", "detail-panel announce-panel glass-panel");
  const announceHeading = createElement("div", "panel-heading");
  announceHeading.append(createElement("div", "", ""));
  announceHeading.firstChild.append(createElement("p", "eyebrow", "在线通知"), createElement("h2", "", "服务器公告"));
  const announceForm = createElement("form", "announce-form");
  const announceInput = document.createElement("input");
  announceInput.type = "text";
  announceInput.maxLength = 200;
  announceInput.placeholder = t("输入发送给在线玩家的公告");
  announceInput.disabled = game.state !== "running" || !game.managementAvailable;
  const announceButton = createElement("button", "player-action", "发送");
  announceButton.type = "submit";
  announceButton.disabled = announceInput.disabled;
  announceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = announceInput.value.trim();
    if (!message) return;
    announceButton.disabled = true;
    await sendGameAnnouncement(game.id, message);
    announceInput.value = "";
    announceButton.disabled = announceInput.disabled;
  });
  announceForm.append(announceInput, announceButton);
  announcePanel.append(announceHeading, announceForm);

  const backupPanel = createElement("section", "detail-panel glass-panel backup-panel");
  const backupForm = createElement("form", "settings-form");
  const backupHeading = createElement("div", "panel-heading settings-heading");
  const backupTitle = document.createElement("div");
  backupTitle.append(createElement("p", "eyebrow", "备份"), createElement("h2", "", "世界快照"));
  const backupSave = createElement("button", "player-action", backupSettingsBusy ? "保存中" : "保存设置");
  backupSave.type = "submit";
  backupSave.disabled = backupSettingsBusy || Boolean(activeOperation.running);
  backupHeading.append(backupTitle, backupSave);
  const backupFacts = createElement("dl", "detail-info");
  const backupDate = game.backup?.createdAt ? new Date(game.backup.createdAt).toLocaleString(i18n.locale) : t("尚未创建");
  backupFacts.append(
    infoRow("最近备份", backupDate),
    infoRow("备份大小", game.backup?.exists ? formatBytes(game.backup.sizeBytes) : "—")
  );
  const backupFields = createElement("div", "settings-grid backup-settings-grid");
  backupFields.append(
    renderSettingField({
      key: "retentionCount", label: "保留份数", type: "integer", min: 1, max: 30,
      value: game.backup?.retentionCount ?? 1, suffix: "份", hint: "允许保留 1–30 份；调低后会立即清理超出的旧备份"
    }),
    renderSettingField({
      key: "intervalHours", label: "自动周期", type: "integer", min: 1, max: 720,
      value: Math.round((game.backup?.intervalSeconds ?? 259200) / 3600), suffix: "小时", hint: "允许 1–720 小时，最低 1 小时，避免过于频繁地压缩存档"
    })
  );
  backupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const retentionCount = backupForm.elements.retentionCount;
    const intervalHours = backupForm.elements.intervalHours;
    if (!retentionCount.checkValidity() || !intervalHours.checkValidity()) {
      backupForm.reportValidity();
      return;
    }
    await saveBackupSettings(game.id, {
      retentionCount: Number(retentionCount.value),
      intervalHours: Number(intervalHours.value)
    });
  });
  backupForm.append(backupHeading, backupFacts, backupFields, createElement("p", "settings-note", "仅影响后续自动备份，无需重启游戏服务器。"));
  backupPanel.append(backupForm);

  const containerPanel = createElement("section", "detail-panel glass-panel");
  const containerHeading = createElement("div", "panel-heading");
  containerHeading.append(createElement("div", "", ""));
  containerHeading.firstChild.append(createElement("p", "eyebrow", "容器"), createElement("h2", "", "运行状态"));
  const containerList = createElement("dl", "detail-info");
  for (const container of game.containers || []) {
    const state = stateLabels[container.state] || container.state;
    const health = container.health ? ` · 健康状态 ${container.health}` : "";
    containerList.append(infoRow(container.name, `${state}${health}`));
  }
  containerPanel.append(containerHeading, containerList);

  const lowerGrid = createElement("div", "detail-grid");
  lowerGrid.append(playersPanel, worldPanel);
  if (game.detailType === "minecraft") lowerGrid.append(renderAccessPanel(game));
  lowerGrid.append(configurationPanel);
  if (["palworld", "terraria", "zomboid"].includes(game.detailType)) lowerGrid.append(announcePanel);
  if (game.detailType === "minecraft" && game.supportsMods !== false) lowerGrid.append(modsPanel);
  lowerGrid.append(backupPanel, containerPanel);
  detailContent.replaceChildren(hero, metrics, lowerGrid);
  detailRenderSignature = getDetailSignature(game);
}

async function loadGameDetail({ quiet = false } = {}) {
  if (!activeGameId) return;
  if (detailLoadPromise) return detailLoadPromise;
  const requestedGameId = activeGameId;
  detailLoadPromise = (async () => {
    try {
      const payload = await api(`/api/games/${requestedGameId}/detail`);
      if (activeGameId !== requestedGameId) return null;
      activeOperation = payload.operation || { running: false };
      const game = { ...payload.game };
      recordMetricSample(game);
      if (activeOperation.running && activeOperation.gameId === game.id) {
        game.state = {
          start: "starting",
          stop: "stopping",
          restart: "restarting",
          backup: game.state,
          save: game.state
        }[activeOperation.action] || game.state;
      }
      reconcileDetail(game);
      lastDetailRefresh = Date.now();
      if (!quiet && !activeOperation.running) setMessage("");
      return payload;
    } catch (error) {
      setMessage(`详情读取失败：${error.message}`, true);
      return null;
    }
  })();
  try {
    return await detailLoadPromise;
  } finally {
    detailLoadPromise = null;
  }
}

function openGameDetail(gameId) {
  activeGameId = gameId;
  libraryView.hidden = true;
  addGameView.hidden = true;
  detailView.hidden = false;
  window.location.hash = `game/${gameId}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
  activeDetailGame = null;
  detailRenderSignature = "";
  detailContent.replaceChildren();
  loadGameDetail();
}

function closeGameDetail() {
  const wasOpen = Boolean(activeGameId);
  activeGameId = null;
  activeDetailGame = null;
  detailRenderSignature = "";
  detailView.hidden = true;
  libraryView.hidden = false;
  if (wasOpen && sessionToken) loadGames({ quiet: true });
  if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
}

async function runPlayerAction(gameId, playerName, action) {
  if (action === "ban" && !window.confirm(t("确定将该玩家加入黑名单吗？"))) return false;
  try {
    const payload = await api(
      `/api/games/${gameId}/players/${encodeURIComponent(playerName)}/${action}`,
      { method: "POST" }
    );
    setMessage(payload.message);
    await delay(700);
    await loadGameDetail({ quiet: true });
    return true;
  } catch (error) {
    setMessage(error.message, true);
    return false;
  }
}

async function runPalworldPlayerAction(gameId, userId, action) {
  if (!userId) return;
  if (action === "ban" && !window.confirm(t("确定封禁该玩家吗？封禁后需要通过服务器管理方式手动解除。"))) return;
  try {
    const payload = await api(
      `/api/games/${gameId}/palworld-players/${encodeURIComponent(userId)}/${action}`,
      { method: "POST" }
    );
    setMessage(payload.message);
    await delay(700);
    await loadGameDetail({ quiet: true });
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function runTerrariaPlayerAction(gameId, playerName, action) {
  if (!playerName) return;
  if (action === "ban" && !window.confirm(t("确定封禁该玩家吗？"))) return;
  try {
    const payload = await api(
      `/api/games/${gameId}/terraria-players/${encodeURIComponent(playerName)}/${action}`,
      { method: "POST" }
    );
    setMessage(payload.message);
    await delay(700);
    await loadGameDetail({ quiet: true });
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function runZomboidPlayerAction(gameId, playerName, action) {
  if (!playerName) return;
  if (action === "ban" && !window.confirm(t("确定封禁该玩家吗？"))) return;
  try {
    const payload = await api(
      `/api/games/${gameId}/zomboid-players/${encodeURIComponent(playerName)}/${action}`,
      { method: "POST" }
    );
    setMessage(payload.message);
    await delay(700);
    await loadGameDetail({ quiet: true });
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function sendGameAnnouncement(gameId, message) {
  try {
    const payload = await api(`/api/games/${gameId}/announce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    setMessage(payload.message);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveBackupSettings(gameId, settings) {
  if (backupSettingsBusy) return;
  backupSettingsBusy = true;
  setMessage("正在保存备份设置");
  try {
    const payload = await api(`/api/games/${gameId}/backup-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings })
    });
    setMessage(payload.message);
  } catch (error) {
    setMessage(`备份设置保存失败：${error.message}`, true);
  } finally {
    backupSettingsBusy = false;
    await loadGameDetail({ quiet: true });
  }
}

async function saveGameSettings(gameId, settings) {
  if (activeOperation.running || settingsBusy) {
    setMessage(`正在执行：${activeOperation.message || "请稍后再试"}`, true);
    return;
  }
  settingsBusy = true;
  setMessage("正在保存服务器配置");
  try {
    const payload = await api(`/api/games/${gameId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings })
    });
    activeOperation = payload.operation;
    settingsBusy = false;
    setMessage(`${payload.operation.message}。世界数据会保持不变。`);
    await loadGameDetail({ quiet: true });
    await monitorAction(gameId, "应用配置");
  } catch (error) {
    settingsBusy = false;
    setMessage(`配置保存失败：${error.message}`, true);
    await loadGameDetail({ quiet: true });
  }
}

async function loadGames({ quiet = false } = {}) {
  if (gamesLoadPromise) return gamesLoadPromise;
  gamesLoadPromise = (async () => {
    try {
      const payload = await api("/api/games");
      render(payload);
      if (!quiet && !payload.operation?.running) setMessage("");
      return payload;
    } catch (error) {
      if (error.status === 401) {
        logout("登录会话已失效，请重新登录");
        return null;
      }
      setMessage(error.message, true);
      return null;
    }
  })();
  try {
    return await gamesLoadPromise;
  } finally {
    gamesLoadPromise = null;
  }
}

async function confirmDanger({ title, message, confirmLabel = "确认删除" }) {
  return new Promise((resolve) => {
    let settled = false;
    confirmTitle.textContent = tt(title);
    confirmMessage.textContent = tt(message);
    confirmAccept.textContent = tt(confirmLabel);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      confirmDialog.removeEventListener("close", onClose);
      if (confirmDialog.open) confirmDialog.close();
      resolve(value);
    };
    const onClose = () => finish(false);
    confirmAccept.onclick = () => finish(true);
    confirmCancel.onclick = () => finish(false);
    confirmDialog.addEventListener("close", onClose);
    confirmDialog.showModal();
  });
}

async function deleteGame(game) {
  const confirmed = await confirmDanger({
    title: `删除 ${game.name}？`,
    message: "将停止服务器，并永久删除世界、模组、备份和容器。此操作无法恢复。"
  });
  if (!confirmed) return;
  if (activeOperation.running) {
    setMessage(`正在执行：${activeOperation.message}`, true);
    openLogs(game.id);
    return;
  }
  busyGame = game.id;
  setMessage(`正在删除 ${game.name}`);
  try {
    const payload = await api(`/api/games/${game.id}`, { method: "DELETE" });
    activeOperation = payload.operation;
    setMessage(`${payload.operation.message}。日志窗口会持续显示进度。`);
    openLogs(game.id);
    await monitorAction(game.id, "删除");
    if (activeGameId === game.id) closeGameDetail();
  } catch (error) {
    setMessage(error.message, true);
    if (error.status === 409) openLogs(game.id);
    busyGame = null;
    await loadGames({ quiet: true });
  }
}

async function runAction(gameId, action, label) {
  if (activeOperation.running) {
    setMessage(`正在执行：${activeOperation.message}`, true);
    return;
  }
  busyGame = gameId;
  setMessage("");
  await loadGames({ quiet: true });
  try {
    const payload = await api(`/api/games/${gameId}/${action}`, { method: "POST" });
    activeOperation = payload.operation;
    setMessage("");
    await loadGames({ quiet: true });
    await monitorAction(gameId, label);
  } catch (error) {
    setMessage(error.message, true);
    busyGame = null;
    await loadGames({ quiet: true });
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function monitorAction(gameId, label) {
  while (true) {
    await delay(2000);
    const payload = await loadGames({ quiet: true });
    if (!payload) continue;
    const operation = payload.operation || { running: false };
    if (operation.running && operation.gameId === gameId) continue;
    busyGame = null;
    if (operation.error) {
      setMessage("");
    } else {
      setMessage(operation.message || `${label}操作已完成`);
    }
    if (label === "删除" && activeGameId === gameId) closeGameDetail();
    if (logDialog.open) await loadLogs();
    if (activeGameId === gameId) await loadGameDetail({ quiet: true });
    return;
  }
}

function formatLogTimestamp(value) {
  if (!value) return "";
  return value.replace("T", " ").replace(/([+-]\d\d:\d\d)$/, "");
}

function renderLogs(payload) {
  lastLogsPayload = payload;
  const currentValue = preferredLogGameId || logFilter.value;
  const existingOptions = new Map([...logFilter.options].map((option) => [option.value, option.textContent]));
  const wantedOptions = new Map([["", t("全部")]]);
  for (const game of payload.games || []) wantedOptions.set(game.id, tt(game.name));
  if (
    existingOptions.size !== wantedOptions.size ||
    [...wantedOptions].some(([value, label]) => existingOptions.get(value) !== label)
  ) {
    logFilter.replaceChildren(...[...wantedOptions].map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
  }
  logFilter.value = wantedOptions.has(currentValue) ? currentValue : "";
  preferredLogGameId = logFilter.value;
  const selectedGameId = logFilter.value;
  const selectedGame = (payload.games || []).find((game) => game.id === selectedGameId);
  const operation = payload.operation || { running: false, message: "暂无进行中的操作" };
  const operationMatches = !selectedGameId || operation.gameId === selectedGameId;
  logOperationStatus.textContent = operationMatches
    ? tt(operation.message || "暂无进行中的操作")
    : tt(`${selectedGame?.name || t("当前游戏")}暂无进行中的操作`);
  logOperationStatus.classList.toggle("is-error", operationMatches && Boolean(operation.error));
  logsButton.classList.toggle("has-activity", Boolean(operation.running));

  const controllerEntries = (payload.controller || []).filter(
    (entry) => !selectedGameId || entry.source === selectedGameId
  );
  const controllerTitle = selectedGame ? tt(`${selectedGame.name} · 总控操作日志`) : tt("全部 · 总控操作日志");
  const containers = (payload.containers || []).filter(
    (container) => !selectedGameId || container.gameId === selectedGameId
  );
  const signature = JSON.stringify({ controllerEntries, containers, selectedGameId });
  if (signature === lastRenderedLogs) return;
  const nearBottom = logOutput.scrollHeight - logOutput.scrollTop - logOutput.clientHeight < 60;

  const sections = [];
  const controllerSection = createElement("section", "log-section");
  const controllerHeader = createElement("header", "log-section-header");
  controllerHeader.append(createElement("h3", "", controllerTitle), createElement("span", "log-section-kind", "Controller"));
  const controllerBody = createElement("div", "log-rows");
  if (controllerEntries.length) {
    for (const entry of controllerEntries) {
      const row = createElement("div", `log-row${entry.level === "error" ? " is-error" : ""}`);
      const timestamp = formatLogTimestamp(entry.timestamp);
      const time = createElement("time", "log-time", timestamp.slice(-8));
      time.dateTime = entry.timestamp || "";
      time.title = timestamp;
      row.append(
        time,
        createElement("span", "log-level", entry.level === "error" ? "ERROR" : "INFO"),
        createElement("span", "log-source", entry.source),
        createElement("span", "log-message", entry.message)
      );
      controllerBody.append(row);
    }
  } else {
    controllerBody.append(createElement("p", "log-empty", "暂无操作记录"));
  }
  controllerSection.append(controllerHeader, controllerBody);
  sections.push(controllerSection);

  for (const container of containers) {
    const section = createElement("section", "log-section");
    const header = createElement("header", "log-section-header");
    header.append(
      createElement("h3", "", `${container.gameName || container.gameId} / ${container.name}`),
      createElement("span", "log-state", stateLabels[container.state] || container.state)
    );
    const stream = createElement("div", "log-stream");
    const lines = String(container.logs || "").trim().split("\n").filter(Boolean);
    if (lines.length) {
      for (const line of lines) stream.append(createElement("div", "log-line", line));
    } else {
      stream.append(createElement("p", "log-empty", "容器当前没有输出"));
    }
    section.append(header, stream);
    sections.push(section);
  }

  logOutput.replaceChildren(...sections);
  lastRenderedLogs = signature;
  if (nearBottom) logOutput.scrollTop = logOutput.scrollHeight;
}

async function loadLogs() {
  if (logsLoadPromise) return logsLoadPromise;
  logsLoadPromise = (async () => {
    try {
      const payload = await api("/api/logs?tail=500");
      renderLogs(payload);
      return payload;
    } catch (error) {
      if (error.status === 401) {
        logout("登录会话已失效，请重新登录");
        return null;
      }
      logOperationStatus.textContent = tt(`日志读取失败：${error.message}`);
      logOperationStatus.classList.add("is-error");
      return null;
    }
  })();
  try {
    return await logsLoadPromise;
  } finally {
    logsLoadPromise = null;
  }
}

function openLogs(gameId = null) {
  preferredLogGameId = typeof gameId === "string" ? gameId : "";
  logFilter.value = preferredLogGameId;
  lastRenderedLogs = "";
  if (lastLogsPayload) renderLogs(lastLogsPayload);
  if (!logDialog.open) logDialog.showModal();
  loadLogs();
  if (logPollTimer) window.clearInterval(logPollTimer);
  logPollTimer = window.setInterval(loadLogs, 2000);
}

function closeLogs() {
  if (logPollTimer) {
    window.clearInterval(logPollTimer);
    logPollTimer = null;
  }
  if (logDialog.open) logDialog.close();
}

async function pollDashboard() {
  if (dashboardPollInFlight) return;
  dashboardPollInFlight = true;
  try {
    await loadGames({ quiet: true });
    if (activeGameId && Date.now() - lastDetailRefresh >= DETAIL_REFRESH_INTERVAL) {
      await loadGameDetail({ quiet: true });
    }
  } finally {
    dashboardPollInFlight = false;
  }
}

function beginPolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(pollDashboard, 3000);
}

function logout(message = "", notifyServer = false) {
  const previousSession = sessionToken;
  sessionToken = "";
  sessionStorage.removeItem("gameControlSession");
  if (notifyServer && previousSession) {
    fetch("/api/logout", {
      method: "POST",
      headers: { "X-Control-Session": previousSession }
    }).catch(() => {});
  }
  setView(false);
  passwordInput.value = "";
  loginError.textContent = tt(message);
  usernameInput.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  try {
    const payload = await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value
      })
    });
    sessionToken = payload.session;
    sessionStorage.setItem("gameControlSession", sessionToken);
    passwordInput.value = "";
    setView(true);
    await loadGames();
    beginPolling();
  } catch (error) {
    loginError.textContent = tt(error.message);
  }
});

refreshButton.addEventListener("click", () => loadGames());
openAddGameButton.addEventListener("click", openAddGame);
emptyAddGameButton.addEventListener("click", openAddGame);
backFromAddGameButton.addEventListener("click", closeAddGame);
backToLibraryButton.addEventListener("click", closeGameDetail);
refreshDetailButton.addEventListener("click", () => {
  lastDetailRefresh = 0;
  loadGameDetail();
});
logsButton.addEventListener("click", () => openLogs());
logFilter.addEventListener("change", () => {
  preferredLogGameId = logFilter.value;
  lastRenderedLogs = "";
  if (lastLogsPayload) renderLogs(lastLogsPayload);
});
refreshLogsButton.addEventListener("click", loadLogs);
closeLogsButton.addEventListener("click", closeLogs);
logDialog.addEventListener("close", () => {
  if (logPollTimer) {
    window.clearInterval(logPollTimer);
    logPollTimer = null;
  }
});
closeUploadButton.addEventListener("click", closeUploadDialog);
uploadDialog.addEventListener("cancel", (event) => {
  if (closeUploadButton.disabled) event.preventDefault();
});
logoutButton.addEventListener("click", () => logout("", true));

(async function initialize() {
  if (!sessionToken) {
    setView(false);
    return;
  }
  try {
    await api("/api/session");
    setView(true);
    await loadGames();
    beginPolling();
    if (window.location.hash === "#add-game") {
      openAddGame();
      return;
    }
    const detailMatch = window.location.hash.match(/^#game\/([a-z0-9_-]+)$/);
    if (detailMatch) openGameDetail(detailMatch[1]);
  } catch {
    logout();
  }
})();
