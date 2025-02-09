/*
Copyright 2022 - 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { useState, useEffect, useCallback, useRef } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { OverlayTriggerState } from "@react-stately/overlays";
import { usePreviewTracks } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack, Track } from "livekit-client";

import { MicButton, SettingsButton, VideoButton } from "../button";
import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { useClient } from "../ClientContext";
import { useMediaDevicesSwitcher } from "../livekit/useMediaDevicesSwitcher";
import { DeviceChoices, UserChoices } from "../livekit/useLiveKit";
import { useDefaultDevices } from "../settings/useSetting";

export type MatrixInfo = {
  displayName: string;
  avatarUrl: string;
  roomName: string;
  roomIdOrAlias: string;
};

interface Props {
  matrixInfo: MatrixInfo;
  onUserChoicesChanged: (choices: UserChoices) => void;
}

export function VideoPreview({ matrixInfo, onUserChoicesChanged }: Props) {
  const { client } = useClient();
  const [previewRef, previewBounds] = useMeasure({ polyfill: ResizeObserver });

  const {
    modalState: settingsModalState,
    modalProps: settingsModalProps,
  }: {
    modalState: OverlayTriggerState;
    modalProps: {
      isOpen: boolean;
      onClose: () => void;
    };
  } = useModalTriggerState();

  const openSettings = useCallback(() => {
    settingsModalState.open();
  }, [settingsModalState]);

  // Create local media tracks.
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  // The settings are updated as soon as the device changes. We wrap the settings value in a ref to store their initial value.
  // Not changing the device options prohibits the usePreviewTracks hook to recreate the tracks.
  const initialDefaultDevices = useRef(useDefaultDevices()[0]);

  const tracks = usePreviewTracks(
    {
      audio: { deviceId: initialDefaultDevices.current.audioinput },
      video: { deviceId: initialDefaultDevices.current.videoinput },
    },
    (error) => {
      console.error("Error while creating preview Tracks:", error);
    }
  );
  const videoTrack = React.useMemo(
    () =>
      tracks?.filter((t) => t.kind === Track.Kind.Video)[0] as LocalVideoTrack,
    [tracks]
  );
  const audioTrack = React.useMemo(
    () =>
      tracks?.filter((t) => t.kind === Track.Kind.Audio)[0] as LocalAudioTrack,
    [tracks]
  );
  // Only let the MediaDeviceSwitcher request permissions if a video track is already available.
  // Otherwise we would end up asking for permissions in usePreviewTracks and in useMediaDevicesSwitcher.
  const requestPermissions = !!videoTrack;
  const mediaSwitcher = useMediaDevicesSwitcher(
    undefined,
    {
      videoTrack,
      audioTrack,
    },
    requestPermissions
  );
  const { videoIn, audioIn } = mediaSwitcher;

  const videoEl = React.useRef(null);

  useEffect(() => {
    // Effect to update the settings
    const createChoices = (
      enabled: boolean,
      deviceId?: string
    ): DeviceChoices | undefined => {
      return deviceId
        ? {
            selectedId: deviceId,
            enabled,
          }
        : undefined;
    };
    onUserChoicesChanged({
      video: createChoices(videoEnabled, videoIn.selectedId),
      audio: createChoices(audioEnabled, audioIn.selectedId),
    });
  }, [
    onUserChoicesChanged,
    videoIn.selectedId,
    videoEnabled,
    audioIn.selectedId,
    audioEnabled,
  ]);

  useEffect(() => {
    // Effect to update the initial device selection for the ui elements based on the current preview track.
    if (!videoIn.selectedId || videoIn.selectedId == "") {
      videoTrack?.getDeviceId().then((videoId) => {
        if (videoId) {
          videoIn.setSelected(videoId);
        }
      });
    }
    if (!audioIn.selectedId || audioIn.selectedId == "") {
      audioTrack?.getDeviceId().then((audioId) => {
        if (audioId) {
          audioIn.setSelected(audioId);
        }
      });
    }
  }, [videoIn, audioIn, videoTrack, audioTrack]);

  useEffect(() => {
    // Effect to connect the videoTrack with the video element.
    if (videoEl.current) {
      videoTrack?.unmute();
      videoTrack?.attach(videoEl.current);
    }
    return () => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={videoEl} muted playsInline disablePictureInPicture />
      <>
        {(videoTrack ? !videoEnabled : true) && (
          <div className={styles.avatarContainer}>
            <Avatar
              size={(previewBounds.height - 66) / 2}
              src={matrixInfo.avatarUrl}
              fallback={matrixInfo.displayName.slice(0, 1).toUpperCase()}
            />
          </div>
        )}
        <div className={styles.previewButtons}>
          <MicButton
            muted={!audioEnabled}
            onPress={() => setAudioEnabled(!audioEnabled)}
          />
          <VideoButton
            muted={!videoEnabled}
            onPress={() => setVideoEnabled(!videoEnabled)}
          />
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          mediaDevicesSwitcher={mediaSwitcher}
          {...settingsModalProps}
        />
      )}
    </div>
  );
}
