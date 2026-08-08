import json
import logging
from typing import Dict, Any

import sys, os
_SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _SHARED not in sys.path:
    sys.path.insert(0, _SHARED)

from nats_envelope.envelope import CanonicalEnvelope
from validator import ContractValidator

class Publisher:
    def __init__(self, nats_url=None, origin_layer=None):
        self.nc = None
        self.js = None
        self.nats_url = nats_url
        self.origin_layer = origin_layer

    async def connect(self):
        if self.nats_url:
            try:
                import nats
                self.nc = await nats.connect(self.nats_url)
                logging.info(f"Connected to NATS at {self.nats_url}")
                try:
                    self.js = self.nc.jetstream()
                    logging.info("JetStream context acquired — observations will be persisted")
                except Exception as e:
                    logging.warning("JetStream unavailable (%s) — falling back to core NATS", e)
            except ImportError:
                logging.warning("nats-py not installed. Falling back to logger.")
            except Exception as e:
                logging.warning(f"Could not connect to NATS: {e}. Falling back to logger.")

    async def publish(self, subject: str, event: CanonicalEnvelope):
        ContractValidator.validate_emission(event, publisher_layer=self.origin_layer)
        event_dict = event.to_dict()
        
        if self.nc:
            try:
                if self.js is not None:
                    try:
                        ack = await self.js.publish(subject, json.dumps(event_dict).encode())
                        logging.debug(f"JetStream ack: {subject} seq={ack.seq}")
                    except Exception as js_err:
                        logging.warning(f"JetStream publish failed (%s) — falling back to core NATS", js_err)
                        await self.nc.publish(subject, json.dumps(event_dict).encode())
                        await self.nc.flush()
                else:
                    await self.nc.publish(subject, json.dumps(event_dict).encode())
                    await self.nc.flush()
            except Exception as e:
                logging.error(f"NATS publish error: {e}")
                logging.info(f"[STUB NATS] {subject}: {json.dumps(event_dict, indent=2)}")
        else:
            logging.info(f"[LOGGER] {subject}: {json.dumps(event_dict, indent=2)}")

    def scoped(self, layer: str):
        scoped_pub = Publisher(nats_url=self.nats_url, origin_layer=layer)
        scoped_pub.nc = self.nc
        scoped_pub.js = self.js
        return scoped_pub

    async def close(self):
        if self.nc:
            await self.nc.close()
