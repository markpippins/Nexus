/**
 * address-tts — TypeSpec Models
 *
 * Reverse-engineered from python/address/tts (http.server REST API).
 * No route or verb decorators live here.
 */
namespace org.nexus.addresstts {

  /** Text-to-speech synthesis request. */
  model SynthesizeRequest {
    text: string;
  }

  /** Text-to-speech synthesis response. */
  model SynthesizeResponse {
    filename?: string;
    audioUrl?: string;
  }
}
