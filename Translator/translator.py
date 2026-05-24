import os
import queue
import threading
import time
import numpy as np
import sounddevice as sd
import whisper
import webrtcvad
import pygame
import pygame.freetype
from deep_translator import GoogleTranslator

# ─── Konfiguracija ────────────────────────────────────────────────────────────
SAMPLE_RATE     = 16000
CHUNK_MS        = 30        # VAD radi sa 10/20/30ms chunkovima
CHUNK_SAMPLES   = int(SAMPLE_RATE * CHUNK_MS / 1000)
SILENCE_LIMIT   = 1.2       # sekundi tišine = kraj rečenice
MAX_RECORD_SEC  = 10        # max dužina jednog segmenta
WHISPER_MODEL   = "small"   # small=brz, medium=tačniji, large-v3=najtačniji
TARGET_LANG     = "sr"      # srpski

# Overlay podešavanja
SCREEN_W        = 900
SCREEN_H        = 120
FONT_SIZE       = 28
DISPLAY_TIME    = 5.0       # sekundi koliko titl ostaje na ekranu

# ─── Prijevod ─────────────────────────────────────────────────────────────────
def translate(text: str) -> str:
    """Prevodi tekst na srpski. Mijenjaj samo ovu funkciju kad dobiješ Claude key."""
    if not text.strip():
        return ""

    # ── Za sada: Google Translate (besplatno) ──
    try:
        return GoogleTranslator(source="auto", target=TARGET_LANG).translate(text)
    except Exception as e:
        print(f"[Greška prijevoda] {e}")
        return text

    # ── Kad kupiš Anthropic key, odkomentiraj ovo i zakomentariši gornji blok ──
    # import anthropic
    # client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    # msg = client.messages.create(
    #     model="claude-opus-4-7",
    #     max_tokens=512,
    #     messages=[{
    #         "role": "user",
    #         "content": (
    #             f"Prevedi sljedeći tekst tačno na srpski jezik. "
    #             f"Vrati SAMO prevod, bez objašnjenja:\n\n{text}"
    #         )
    #     }]
    # )
    # return msg.content[0].text.strip()


# ─── Overlay ──────────────────────────────────────────────────────────────────
class Overlay:
    def __init__(self):
        pygame.init()
        pygame.freetype.init()
        self.screen = pygame.display.set_mode(
            (SCREEN_W, SCREEN_H),
            pygame.NOFRAME
        )
        pygame.display.set_caption("Translator")
        self.font = pygame.freetype.SysFont("DejaVu Sans", FONT_SIZE)
        self.text       = ""
        self.show_until = 0
        self.lock       = threading.Lock()

    def show(self, text: str):
        with self.lock:
            self.text       = text
            self.show_until = time.time() + DISPLAY_TIME

    def run(self):
        """Pokreće se u glavnoj niti — blokira dok se prozor ne zatvori."""
        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    running = False

            self.screen.fill((0, 0, 0))

            with self.lock:
                if time.time() < self.show_until and self.text:
                    surf, rect = self.font.render(self.text, (255, 255, 100))
                    x = (SCREEN_W - rect.width)  // 2
                    y = (SCREEN_H - rect.height) // 2
                    self.screen.blit(surf, (x, y))

            pygame.display.flip()
            pygame.time.Clock().tick(30)

        pygame.quit()


# ─── Audio capture + VAD ──────────────────────────────────────────────────────
class AudioCapture:
    def __init__(self, audio_q: queue.Queue):
        self.audio_q   = audio_q
        self.vad       = webrtcvad.Vad(2)  # agresivnost 0-3
        self.buffer    = []
        self.recording = False
        self.silence_chunks = 0
        self.silence_limit_chunks = int(SILENCE_LIMIT * 1000 / CHUNK_MS)
        self.max_chunks = int(MAX_RECORD_SEC * 1000 / CHUNK_MS)

    def callback(self, indata, frames, time_info, status):
        pcm = (indata[:, 0] * 32768).astype(np.int16).tobytes()

        try:
            is_speech = self.vad.is_speech(pcm, SAMPLE_RATE)
        except Exception:
            is_speech = False

        if is_speech:
            self.buffer.append(indata[:, 0].copy())
            self.recording = True
            self.silence_chunks = 0
        elif self.recording:
            self.buffer.append(indata[:, 0].copy())
            self.silence_chunks += 1

            if (self.silence_chunks >= self.silence_limit_chunks
                    or len(self.buffer) >= self.max_chunks):
                audio = np.concatenate(self.buffer).astype(np.float32)
                self.audio_q.put(audio)
                self.buffer = []
                self.recording = False
                self.silence_chunks = 0

    def list_devices(self):
        print(sd.query_devices())

    def start(self, device=None):
        return sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=CHUNK_SAMPLES,
            device=device,
            callback=self.callback,
        )


# ─── Pipeline nit ─────────────────────────────────────────────────────────────
def pipeline_worker(audio_q: queue.Queue, overlay: Overlay, model):
    print("[INFO] Pipeline spreman, čekam govor...")
    while True:
        audio = audio_q.get()
        if audio is None:
            break

        # STT
        result = model.transcribe(audio, language=None, fp16=False)
        original = result["text"].strip()
        detected = result.get("language", "?")

        if not original:
            continue

        print(f"[{detected.upper()}] {original}")

        # Prevod
        translated = translate(original)
        print(f"[SR]  {translated}\n")

        overlay.show(translated)


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 50)
    print("  Real-Time Translator → Srpski")
    print("=" * 50)
    print(f"Učitavam Whisper model '{WHISPER_MODEL}'...")
    model = whisper.load_model(WHISPER_MODEL)
    print("Model spreman.\n")

    # Pokaži dostupne audio uređaje
    print("Dostupni audio uređaji:")
    print(sd.query_devices())
    print()
    print("Postavi LOOPBACK uređaj za system audio (Monitor of ...).")
    print("Pritisni ENTER za default mikrofon, ili upiši broj uređaja: ", end="")
    device_input = input().strip()
    device = int(device_input) if device_input.isdigit() else None

    audio_q   = queue.Queue()
    overlay   = Overlay()
    capture   = AudioCapture(audio_q)

    worker = threading.Thread(
        target=pipeline_worker,
        args=(audio_q, overlay, model),
        daemon=True
    )
    worker.start()

    with capture.start(device=device):
        print("[INFO] Slušam... (ESC ili zatvori prozor da stanem)\n")
        overlay.run()  # blokira do zatvaranja

    audio_q.put(None)
    worker.join(timeout=3)
    print("Zaustavljeno.")


if __name__ == "__main__":
    main()
