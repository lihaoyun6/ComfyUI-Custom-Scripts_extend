import os
import json
from server import PromptServer
from aiohttp import web
import folder_paths

DB_FILE = os.path.join(os.path.dirname(__file__), "pending_deletes.json")

def get_pending_deletes():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_pending_deletes(data):
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"[ImageFeed] Failed to save pending deletes: {e}")

def clear_pending_deletes():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "w"):
                pass
        except Exception:
            pass

def physical_delete(filepath):
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception as e:
            print(f"[ImageFeed] Error deleting file {filepath}: {e}")

def cleanup_pending_files():
    pending = get_pending_deletes()
    if pending:
        print(f"[ImageFeed] Cleaning up {len(pending)} pending delete files from last session...")
        for filepath in pending:
            physical_delete(filepath)
        clear_pending_deletes()

cleanup_pending_files()

@PromptServer.instance.routes.post("/pysssss/image-feed/register")
async def register_new_images(request):
    try:
        data = await request.json()
        new_images = data.get("images", [])

        new_filepaths = set()
        for img in new_images:
            filename = img.get("filename")
            file_type = img.get("type", "output")
            subfolder = img.get("subfolder", "")
            
            if file_type == "input":
                base_dir = folder_paths.get_input_directory()
            elif file_type == "temp":
                base_dir = folder_paths.get_temp_directory()
            else:
                base_dir = folder_paths.get_output_directory()
            
            filepath = os.path.abspath(os.path.join(base_dir, subfolder, filename))
            new_filepaths.add(filepath)

        pending = get_pending_deletes()
        if pending:
            new_pending = []
            for filepath in pending:
                if filepath in new_filepaths:
                    pass
                else:
                    physical_delete(filepath)
            
            if new_pending:
                save_pending_deletes(new_pending)
            else:
                clear_pending_deletes()

        return web.json_response({"status": "success"})
    except Exception as e:
        return web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/pysssss/image-feed/delete")
async def delete_image_feed_file(request):
    try:
        data = await request.json()
        filename = data.get("filename")
        file_type = data.get("type", "output")
        subfolder = data.get("subfolder", "")
        defer = data.get("defer", False)
        
        if not filename:
            return web.Response(status=400, text="Filename is required")
        
        if file_type == "input":
            base_dir = folder_paths.get_input_directory()
        elif file_type == "temp":
            base_dir = folder_paths.get_temp_directory()
        else:
            base_dir = folder_paths.get_output_directory()
            
        filepath = os.path.abspath(os.path.join(base_dir, subfolder, filename))
        if not filepath.startswith(os.path.abspath(base_dir)):
            return web.Response(status=403, text="Access denied")
        
        if defer:
            pending = get_pending_deletes()
            if filepath not in pending:
                pending.append(filepath)
                save_pending_deletes(pending)
            return web.json_response({"status": "deferred", "message": f"File {filename} deferred."})
        else:
            physical_delete(filepath)
            return web.json_response({"status": "deleted", "message": f"Deleted {filename}."})
        
    except Exception as e:
        return web.Response(status=500, text=str(e))

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}