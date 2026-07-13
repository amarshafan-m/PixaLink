import {
  helloVoid,
  helloError,
  helloStr,
  helloNum,
  helloArrayStr,
  helloObj,
} from "../utils/samples";
export { helloError, helloStr, helloNum, helloArrayStr, helloObj, helloVoid };
import { dispatchTS } from "../utils/utils";

export const qeDomFunction = () => {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (qe) {
    qe.name;
    qe.project.getVideoEffectByName("test");
  }
};

export const helloWorld = () => {
  alert("Hello from Premiere Pro.");
};

export const isTrackLocked = (trackName: string): boolean => {
  try {
    const project = app.project;
    if (!project) return false;
    const sequence = project.activeSequence;
    if (!sequence) return false;

    const isAudioTrack = trackName && trackName.charAt(0) === "A";
    const trackIndex = trackName ? (parseInt(trackName.substring(1), 10) - 1) : 0;

    if (isAudioTrack) {
      if (sequence.audioTracks && trackIndex >= 0 && trackIndex < sequence.audioTracks.numTracks) {
        const track = sequence.audioTracks[trackIndex];
        return track && typeof track.isLocked === "function" ? track.isLocked() : false;
      }
    } else {
      if (sequence.videoTracks && trackIndex >= 0 && trackIndex < sequence.videoTracks.numTracks) {
        const track = sequence.videoTracks[trackIndex];
        return track && typeof track.isLocked === "function" ? track.isLocked() : false;
      }
    }
  } catch (err) {
    // ignore
  }
  return false;
};

export const importToTimeline = (filePath: string, trackName: string): string => {
  try {
    if (!filePath) {
      return "ERROR:No downloaded file path was provided.";
    }

    const file = new File(filePath);
    if (!file.exists) {
      return "ERROR:Downloaded file does not exist: " + filePath;
    }

    const project = app.project;
    if (!project) {
      return "ERROR:Open a Premiere Pro project before importing.";
    }

    let targetBin = project.rootItem;
    try {
      const categoryName = file.parent.name;
      const providerName = file.parent.parent.name;
      if (categoryName && providerName) {
        const mainBin = getOrCreateBin(project.rootItem, "PixaLinkAssets");
        const providerBin = getOrCreateBin(mainBin, providerName);
        targetBin = getOrCreateBin(providerBin, categoryName);
      }
    } catch (binErr) {
      // ignore
    }

    const before = flattenProjectItems(project.rootItem);
    const ok = project.importFiles([file.fsName], false, targetBin, false);
    if (!ok) {
      return "ERROR:Premiere Pro could not import this file.";
    }

    const importedItem = findNewProjectItem(project.rootItem, before, file.name);
    const sequence = project.activeSequence;
    if (!sequence) {
      return "ERROR:No active sequence open.";
    }
    if (!importedItem) {
      return "Imported into the project panel.";
    }

    const time = sequence.getPlayerPosition();

    // Parse track name like "V2" or "A3"
    const isAudioTrack = trackName && trackName.charAt(0) === "A";
    const trackIndex = trackName ? (parseInt(trackName.substring(1), 10) - 1) : 0;

    if (isAudioTrack) {
      if (sequence.audioTracks && trackIndex >= 0 && trackIndex < sequence.audioTracks.numTracks) {
        const track = sequence.audioTracks[trackIndex];
        if (track && typeof track.isLocked === "function" && track.isLocked()) {
          return "ERROR:Track " + trackName + " is locked. Please unlock it.";
        }
        try {
          track.overwriteClip(importedItem, time);
          return "Imported to " + trackName + " at playhead.";
        } catch (e1) {
          try {
            track.insertClip(importedItem, time);
            return "Imported to " + trackName + " at playhead.";
          } catch (e2) {}
        }
      }
      // fallback to first audio track
      if (sequence.audioTracks && sequence.audioTracks.numTracks > 0) {
        const fallbackTrack = sequence.audioTracks[0];
        if (fallbackTrack && typeof fallbackTrack.isLocked === "function" && fallbackTrack.isLocked()) {
          return "ERROR:Fallback track A1 is locked. Please unlock it.";
        }
        try {
          fallbackTrack.insertClip(importedItem, time);
          return "Imported to A1 at playhead (fallback).";
        } catch (e) {}
      }
    } else {
      if (sequence.videoTracks && trackIndex >= 0 && trackIndex < sequence.videoTracks.numTracks) {
        const track = sequence.videoTracks[trackIndex];
        if (track && typeof track.isLocked === "function" && track.isLocked()) {
          return "ERROR:Track " + (trackName || "V1") + " is locked. Please unlock it.";
        }
        try {
          track.overwriteClip(importedItem, time);
          return "Imported to " + (trackName || "V1") + " at playhead.";
        } catch (e1) {
          try {
            track.insertClip(importedItem, time);
            return "Imported to " + (trackName || "V1") + " at playhead.";
          } catch (e2) {}
        }
      }
      // fallback to first video track
      if (sequence.videoTracks && sequence.videoTracks.numTracks > 0) {
        const fallbackTrack = sequence.videoTracks[0];
        if (fallbackTrack && typeof fallbackTrack.isLocked === "function" && fallbackTrack.isLocked()) {
          return "ERROR:Fallback track V1 is locked. Please unlock it.";
        }
        try {
          fallbackTrack.insertClip(importedItem, time);
          return "Imported to V1 at playhead (fallback).";
        } catch (e) {}
      }
    }

    return "Imported into the project panel.";
  } catch (error: any) {
    return "ERROR:" + error.toString();
  }
};

const insertOnFirstAvailableTrack = (
  sequence: Sequence,
  projectItem: ProjectItem,
  time: Time
): boolean => {
  if (projectItem.type === ProjectItemType.CLIP || projectItem.type === ProjectItemType.FILE) {
    if (sequence.videoTracks && sequence.videoTracks.numTracks > 0) {
      try {
        sequence.videoTracks[0].insertClip(projectItem, time);
        return true;
      } catch (videoError) {}
    }

    if (sequence.audioTracks && sequence.audioTracks.numTracks > 0) {
      try {
        sequence.audioTracks[0].insertClip(projectItem, time);
        return true;
      } catch (audioError) {}
    }
  }
  return false;
};

const flattenProjectItems = (item: ProjectItem): { [key: string]: boolean } => {
  const map: { [key: string]: boolean } = {};
  visit(item, (child) => {
    map[child.nodeId] = true;
  });
  return map;
};

const findNewProjectItem = (
  root: ProjectItem,
  before: { [key: string]: boolean },
  expectedName: string
): ProjectItem | null => {
  let found: ProjectItem | null = null;
  visit(root, (child) => {
    if (!before[child.nodeId] && child.name === expectedName) {
      found = child;
    }
  });
  return found;
};

const visit = (item: ProjectItem, callback: (item: ProjectItem) => void) => {
  if (!item || !item.children) {
    return;
  }
  for (let i = 0; i < item.children.numItems; i++) {
    const child = item.children[i];
    callback(child);
    visit(child, callback);
  }
};

export const hasActiveSequence = (): boolean => {
  const project = app.project;
  if (!project) {
    return false;
  }
  return !!project.activeSequence;
};

export const getProjectDirectory = (): string => {
  const project = app.project;
  if (!project) {
    return "";
  }
  const path = project.path;
  if (!path) {
    return "";
  }
  const file = new File(path);
  if (file.parent && file.parent.exists) {
    return file.parent.fsName;
  }
  return "";
};

const getOrCreateBin = (parentItem: ProjectItem, name: string): ProjectItem => {
  for (let i = 0; i < parentItem.children.numItems; i++) {
    const child = parentItem.children[i];
    if (child.type === 2 && child.name === name) {
      return child;
    }
  }
  return parentItem.createBin(name);
};

export const getSequenceTracks = (): string => {
  try {
    const project = app.project;
    if (!project || !project.activeSequence) {
      return JSON.stringify({ video: [], audio: [] });
    }
    const seq = project.activeSequence;
    const video: string[] = [];
    const audio: string[] = [];

    if (seq.videoTracks) {
      for (let i = 0; i < seq.videoTracks.numTracks; i++) {
        const track = seq.videoTracks[i];
        if (!track.isMuted()) {
          video.push("V" + (i + 1));
        }
      }
    }
    if (seq.audioTracks) {
      for (let i = 0; i < seq.audioTracks.numTracks; i++) {
        const track = seq.audioTracks[i];
        if (!track.isMuted()) {
          audio.push("A" + (i + 1));
        }
      }
    }
    return JSON.stringify({ video, audio });
  } catch (e: any) {
    return JSON.stringify({ video: [], audio: [] });
  }
};
