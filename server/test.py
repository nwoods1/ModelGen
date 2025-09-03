# quick_probe.py
from gradio_client import Client, handle_file
c = Client("https://hysts-shap-e.hf.space")

meta = c.view_api()
print("named_endpoints:", (meta or {}).get("named_endpoints"))

# If it *does* expose /image-to-3d, this will work:
try:
    out = c.predict(
        image=handle_file("test.png"),
        seed=0, guidance_scale=3, num_inference_steps=8,
        api_name="/image-to-3d",
    )
    print("OK /image-to-3d:", out)
except Exception as e:
    print("predict /image-to-3d failed:", e)

# Fallback: try a few fn_index (some Spaces hide api_name but keep function index)
for fn in [1,2,3,0]:
    try:
        out = c.predict(
            image=handle_file("test.png"),
            seed=0, guidance_scale=3, num_inference_steps=8,
            fn_index=fn,
        )
        print(f"OK fn_index={fn}:", out)
        break
    except Exception as e:
        print(f"fn_index={fn} failed:", e)
