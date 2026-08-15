/**
 * address-tts — TypeSpec Operations
 *
 * Reverse-engineered from python/address/tts/main.py (http.server
 * BaseHTTPRequestHandler). do_GET handles /health and /audio/*; do_POST
 * handles /speak and /synthesize.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.addresstts {

  @route("/health")
  @get
  @doc("Liveness check.")
  op health(): unknown;

  @route("/audio/{name}")
  @get
  @doc("Serve a synthesized audio file.")
  op getAudio(@path name: string): unknown;

  @route("/speak")
  @post
  @doc("Synthesize text to speech and play it.")
  op speak(@body body: SynthesizeRequest): SynthesizeResponse | unknown;

  @route("/synthesize")
  @post
  @doc("Synthesize text to speech and return the audio URL.")
  op synthesize(@body body: SynthesizeRequest): SynthesizeResponse | unknown;
}
