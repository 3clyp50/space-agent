import {
  buildGroupIndexSnapshot,
  hydrateGroupIndexSnapshot,
  serializeGroupIndexSnapshot
} from "../../customware/group_index.js";
import { WatchdogHandler } from "../watchdog.js";

export default class GroupIndexHandler extends WatchdogHandler {
  createInitialState() {
    return buildGroupIndexSnapshot({
      filePaths: [],
      projectRoot: this.projectRoot,
      runtimeParams: this.runtimeParams
    });
  }

  rebuild(context) {
    const pathIndex = context.getIndex("path_index") || {};

    this.state = buildGroupIndexSnapshot({
      filePaths: Object.keys(pathIndex),
      projectRoot: this.projectRoot,
      runtimeParams: this.runtimeParams
    });
  }

  async onStart(context) {
    this.rebuild(context);
  }

  async onChanges(context) {
    this.rebuild(context);
  }

  restoreState(state) {
    this.state = hydrateGroupIndexSnapshot(state);
  }

  serializeState(state) {
    return serializeGroupIndexSnapshot(state);
  }
}
