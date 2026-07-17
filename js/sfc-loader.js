import * as chartModule from "./chart.js";
import * as firebaseStoreModule from "./services/firebase-store.js?v=20260717-4";
import * as notificationModule from "./services/notification.js";
import * as exportRecordsModule from "./utils/export-records.js?v=20260717-4";
import * as jsonImportModule from "./utils/json-import.js";
import * as recordUtilsModule from "./utils/record-utils.js?v=20260717-4";

const loader = window["vue3-sfc-loader"];

if (!loader) {
  throw new Error("vue3-sfc-loader の読み込みに失敗しました。");
}

const options = {
  moduleCache: {
    vue: Vue,
    "@weight-tool/chart": chartModule,
    "@weight-tool/firebase-store": firebaseStoreModule,
    "@weight-tool/notification": notificationModule,
    "@weight-tool/export-records": exportRecordsModule,
    "@weight-tool/json-import": jsonImportModule,
    "@weight-tool/record-utils": recordUtilsModule,
  },
  pathResolve({ refPath, relPath }) {
    // moduleCache の名前付きモジュールはURLへ変換しない。
    if (!relPath.startsWith(".") && !relPath.startsWith("/")) {
      return relPath;
    }
    return new URL(relPath, refPath || window.location.href).href;
  },
  async getFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw Object.assign(new Error(`${response.statusText} ${url}`), { response });
    }
    return {
      getContentData: (asBinary) => (
        asBinary ? response.arrayBuffer() : response.text()
      ),
    };
  },
  addStyle(textContent) {
    const style = Object.assign(document.createElement("style"), { textContent });
    const firstStyle = document.head.querySelector("style");
    document.head.insertBefore(style, firstStyle);
  },
  log(type, ...args) {
    const logger = typeof console[type] === "function" ? console[type] : console.log;
    logger.call(console, ...args);
  },
};

export function loadSfc(relativePath) {
  const url = new URL(relativePath, import.meta.url).href;
  return loader.loadModule(url, options);
}
