import os
import json
import hashlib
from server import PromptServer
from aiohttp import web
import folder_paths

DB_FILE = os.path.join(os.path.dirname(__file__), "pending_deletes.json")

def get_pending_deletes():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    if data and isinstance(data[0], str):
                        return [{"filepath": path, "hash": ""} for path in data]
                    return data
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
            os.remove(DB_FILE)
        except Exception:
            pass
            
def calculate_fast_hash(filepath):
    if not os.path.exists(filepath):
        return ""
    try:
        stat = os.stat(filepath)
        size = stat.st_size
        mtime = stat.st_mtime
                
        hasher = hashlib.md5()
        hasher.update(f"{size}_{mtime}".encode("utf-8"))
        return hasher.hexdigest()
    except Exception as e:
        print(f"[ImageFeed] Error calculating fast hash: {e}")
        return ""
    
def physical_delete(filepath):
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception as e:
            print(f"[ImageFeed] Error deleting file {filepath}: {e}")
            
def cleanup_pending_files():
    pending = get_pending_deletes()
    if pending:
        print(f"[ImageFeed] Cleaning up {len(pending)} pending deletes...")
        for item in pending:
            filepath = item.get("filepath")
            stored_hash = item.get("hash")
            
            if filepath and os.path.exists(filepath):
                current_hash = calculate_fast_hash(filepath)
                if current_hash == stored_hash:
                    physical_delete(filepath)
        clear_pending_deletes()
        
cleanup_pending_files()

@PromptServer.instance.routes.get("/pysssss/image-feed/trash-count")
async def get_trash_count(request):
    try:
        pending = get_pending_deletes()
        return web.json_response({"count": len(pending)})
    except Exception as e:
        return web.Response(status=500, text=str(e))
    
@PromptServer.instance.routes.post("/pysssss/image-feed/delete")
async def delete_image_feed_file(request):
    try:
        data = await request.json()
        filename = data.get("filename")
        file_type = data.get("type", "output")
        subfolder = data.get("subfolder", "")
        
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
        
        file_hash = calculate_fast_hash(filepath)
        
        pending = get_pending_deletes()
        if not any(item.get("filepath") == filepath for item in pending):
            pending.append({
                "filepath": filepath,
                "hash": file_hash
            })
            save_pending_deletes(pending)
            
        return web.json_response({
            "status": "deferred", 
            "message": f"File {filename} added to trash.",
            "count": len(pending)
        })
    except Exception as e:
        return web.Response(status=500, text=str(e))
    
@PromptServer.instance.routes.post("/pysssss/image-feed/empty-trash")
async def empty_trash_files(request):
    try:
        pending = get_pending_deletes()
        if pending:
            for item in pending:
                filepath = item.get("filepath")
                stored_hash = item.get("hash")
                
                if filepath and os.path.exists(filepath):
                    current_hash = calculate_fast_hash(filepath)
                    if current_hash == stored_hash:
                        physical_delete(filepath)
            clear_pending_deletes()
            
        return web.json_response({
            "status": "success", 
            "message": "Trash emptied safely.",
            "count": 0
        })
    except Exception as e:
        return web.Response(status=500, text=str(e))
    
WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}