export interface WebRtcStreamConnection {
  peerConnection: RTCPeerConnection;
  close: () => void;
}

export async function connectToWhepStream(
  video: HTMLVideoElement,
  whepUrl: string,
  signal?: AbortSignal
): Promise<WebRtcStreamConnection> {
  const peerConnection = new RTCPeerConnection();
  peerConnection.addTransceiver('video', { direction: 'recvonly' });
  peerConnection.addTransceiver('audio', { direction: 'recvonly' });

  const mediaStream = new MediaStream();
  peerConnection.ontrack = event => {
    event.streams[0]?.getTracks().forEach(track => mediaStream.addTrack(track));
    video.srcObject = mediaStream;
  };

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await new Promise<void>((resolve, reject) => {
      if (peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const handleGatheringStateChange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          peerConnection.removeEventListener('icegatheringstatechange', handleGatheringStateChange);
          resolve();
        }
      };

      peerConnection.addEventListener('icegatheringstatechange', handleGatheringStateChange);
      signal?.addEventListener('abort', () => reject(new DOMException('Connection aborted', 'AbortError')), { once: true });
    });

    const localDescription = peerConnection.localDescription;
    if (!localDescription) throw new Error('WebRTC offer was not created.');

    const response = await fetch(whepUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: localDescription.sdp,
      signal,
    });

    if (!response.ok) {
      throw new Error(`WebRTC gateway returned HTTP ${response.status}.`);
    }

    const answer = await response.text();
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: answer });

    return {
      peerConnection,
      close: () => {
        video.srcObject = null;
        peerConnection.close();
      },
    };
  } catch (error) {
    peerConnection.close();
    throw error;
  }
}
