import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";
import { $el } from "../../../scripts/ui.js";

const trulyNewestImages = new Set();
let isRestoring = false;

$el("style", {
	textContent: `
	.pysssss-image-feed-list > div {
		position: relative !important;
	}
	.pysssss-image-actions-injector {
		position: absolute;
		top: 5px;
		right: 5px;
		display: none;
		gap: 4px;
		z-index: 10;
		pointer-events: none;
	}
	.pysssss-image-feed-list > div:hover .pysssss-image-actions-injector {
		display: flex;
	}
	.pysssss-image-action-btn-injector {
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		width: 26px;
		height: 26px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, color 0.15s;
		padding: 0;
		pointer-events: auto;
	}
	.pysssss-image-action-btn-injector svg {
		width: 16px;
		height: 16px;
	}
	.pysssss-image-action-btn-injector:hover {
		background: rgba(0, 0, 0, 0.9);
	}
	.pysssss-image-action-btn-injector.delete-btn {
		color: #ff4d4f;
		border-color: rgba(255, 77, 79, 0.4);
	}
	.pysssss-image-action-btn-injector.delete-btn:hover {
		background: #ff4d4f;
		color: #fff;
	}
	.pysssss-lightbox {
		position: relative !important;
	}
	.pysssss-lightbox-actions-injector {
		position: absolute;
		bottom: 24px;
		right: 24px;
		display: flex;
		gap: 12px;
		z-index: 10001;
	}
	.pysssss-lightbox-action-btn-injector {
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		border: 1.5px solid var(--border-color);
		border-radius: 8px;
		width: 48px;  
		height: 48px; 
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, color 0.15s, transform 0.1s;
		padding: 0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}
	.pysssss-lightbox-action-btn-injector svg {
		width: 26px;  
		height: 26px; 
	}
	.pysssss-lightbox-action-btn-injector:hover {
		background: rgba(0, 0, 0, 0.95);
		transform: scale(1.05);
	}
	.pysssss-lightbox-action-btn-injector:active {
		transform: scale(0.95);
	}
	.pysssss-lightbox-action-btn-injector.delete-btn {
		color: #ff4d4f;
		border-color: rgba(255, 77, 79, 0.6);
	}
	.pysssss-lightbox-action-btn-injector.delete-btn:hover {
		background: #ff4d4f;
		color: #fff;
	}
	`,
	parent: document.head,
});

app.registerExtension({
	name: "pysssss_extend.ImageFeed.Injector",
	async setup() {
		const isCustomScriptInstalled = app.extensions?.some(ext =>
			ext?.name?.toLowerCase().includes("pysssss.imagefeed")
		);
		
		if (!isCustomScriptInstalled) {
			console.warn('[ComfyUI-Custom-Scripts_extend] "ComfyUI-Custom-Scripts" not installed, injection skipped!');
			return;
		}
		
		const { lightbox } = await import("/extensions/ComfyUI-Custom-Scripts/js/common/lightbox.js");
		
		app.ui.settings.addSetting({
			id: "pysssss.ImageFeed.forceDelete",
			category: ['pysssss', 'ImageFeed', '🐍 Delete Without Confirmation'],
			name: "🐍 Delete Without Confirmation",
			type: "boolean",
			defaultValue: false,
			tooltip: "Images can be deleted from the gallery without confirmation."
		});
		
		function parseImageSrc(src) {
			if (!src) return null;
			const url = new URL(src, window.location.origin);
			return {
				filename: url.searchParams.get("filename") || "image.png",
				type: url.searchParams.get("type") || "output",
				subfolder: url.searchParams.get("subfolder") || ""
			};
		}

		function triggerDownload(src, filename) {
			const a = document.createElement("a");
			a.href = src;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}

		function saveGalleryToLocalStorage() {
			if (isRestoring) return;
			const listElement = document.querySelector(".pysssss-image-feed-list");
			if (!listElement) return;

			const images = [];
			const items = listElement.querySelectorAll(".pysssss-image-item, .pysssss-image-feed-list > div");
			items.forEach(item => {
				const img = item.querySelector("img");
				if (img) {
					const fileInfo = parseImageSrc(img.getAttribute("src"));
					if (fileInfo) images.push(fileInfo);
				}
			});

			const limited = images.slice(0, 150);
			localStorage.setItem("pysssss.ImageFeed.PersistedImages", JSON.stringify(limited));
		}

		let saveTimeout;
		function queueSave() {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(saveGalleryToLocalStorage, 200);
		}
		
		function saveTrulyNewestToLocalStorage() {
			localStorage.setItem("pysssss.ImageFeed.TrulyNewest", JSON.stringify([...trulyNewestImages]));
		}
		
		function restoreTrulyNewestFromLocalStorage() {
			const stored = localStorage.getItem("pysssss.ImageFeed.TrulyNewest");
			if (stored) {
				try {
					const list = JSON.parse(stored);
					if (Array.isArray(list)) {
						list.forEach(item => trulyNewestImages.add(item));
					}
				} catch (e) {
					console.warn("Failed to restore truly newest list", e);
				}
			}
		}

		async function requestDeleteFile(fileInfo) {
			const isNewest = trulyNewestImages.has(fileInfo.filename);
			if (isNewest) {
				trulyNewestImages.delete(fileInfo.filename);
				saveTrulyNewestToLocalStorage();
			}

			try {
				await api.fetchApi("/pysssss/image-feed/delete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						filename: fileInfo.filename,
						type: fileInfo.type,
						subfolder: fileInfo.subfolder,
						defer: isNewest
					})
				});
			} catch (err) {
				console.warn("Server file deletion request failed. Removing from Feed UI only.", err);
			}
		}

		function injectGalleryButtons(itemDiv) {
			if (itemDiv.querySelector(".pysssss-image-actions-injector")) return;

			const anchor = itemDiv.querySelector("a");
			if (!anchor) return;

			const href = anchor.getAttribute("href");
			if (!href) return;

			const fileInfo = parseImageSrc(href);
			if (!fileInfo) return;

			const img = itemDiv.querySelector("img");
			if (img) {
				img.onerror = () => {
					itemDiv.remove();
					window.dispatchEvent(new Event("resize"));
				};
			}

			const actionsWrapper = $el("div.pysssss-image-actions-injector", [
				$el("button.pysssss-image-action-btn-injector.download-btn", {
					title: "Download Image",
					innerHTML: `
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download">
							<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>
						</svg>
					`,
					onclick: (e) => {
						e.preventDefault();
						e.stopPropagation();
						triggerDownload(href, fileInfo.filename);
					}
				}),

				$el("button.pysssss-image-action-btn-injector.delete-btn", {
					title: "Delete File",
					innerHTML: `
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
							<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
								<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
								<line x1="10" y1="11" x2="10" y2="17"/>
								<line x1="14" y1="11" x2="14" y2="17"/>
							</g>
						</svg>
					`,
					onclick: async (e) => {
						e.preventDefault();
						e.stopPropagation();
						
						const forceDelete = app.ui.settings.getSettingValue("pysssss.ImageFeed.forceDelete");
						
						if (!forceDelete) {
							const confirmed = confirm(`Are you sure you want to delete this local file?\n\nFile: ${fileInfo.filename}`);
							if (!confirmed) return;
						}
						
						await requestDeleteFile(fileInfo);
						itemDiv.remove();
						window.dispatchEvent(new Event("resize"));
					}
				})
			]);

			itemDiv.appendChild(actionsWrapper);
		}

		function injectLightboxButtons(lightboxEl) {
			if (lightboxEl.querySelector(".pysssss-lightbox-actions-injector")) return;

			function getCurrentImageSrc() {
				const img = lightboxEl.querySelector("img");
				return img ? img.getAttribute("src") : null;
			}

			const lightboxActions = $el("div.pysssss-lightbox-actions-injector", [
				$el("button.pysssss-lightbox-action-btn-injector.download-btn", {
					title: "Download Image",
					innerHTML: `
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download">
							<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>
						</svg>
					`,
					onclick: (e) => {
						e.preventDefault();
						e.stopPropagation();
						const currentSrc = getCurrentImageSrc();
						const fileInfo = parseImageSrc(currentSrc);
						if (currentSrc && fileInfo) triggerDownload(currentSrc, fileInfo.filename);
					}
				}),
				
				$el("button.pysssss-lightbox-action-btn-injector.delete-btn", {
					title: "Delete File",
					innerHTML: `
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
							<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
								<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
								<line x1="10" y1="11" x2="10" y2="17"/>
								<line x1="14" y1="11" x2="14" y2="17"/>
							</g>
						</svg>
					`,
					onclick: async (e) => {
						e.preventDefault();
						e.stopPropagation();
						const currentSrc = getCurrentImageSrc();
						const fileInfo = parseImageSrc(currentSrc);
						if (!currentSrc || !fileInfo) return;

						const forceDelete = app.ui.settings.getSettingValue("pysssss.ImageFeed.forceDelete");
						if (!forceDelete) {
							const confirmed = confirm(`Are you sure you want to delete this local file?\n\nFile: ${fileInfo.filename}`);
							if (!confirmed) return;
						}

						const feedList = document.querySelector(".pysssss-image-feed-list");
						if (feedList) {
							const items = feedList.querySelectorAll(".pysssss-image-item, div");
							for (const item of items) {
								const a = item.querySelector("a");
								if (a) {
									const itemHref = a.getAttribute("href");
									if (itemHref && itemHref.includes(`filename=${encodeURIComponent(fileInfo.filename)}`)) {
										item.remove();
										break;
									}
								}
							}
						}

						await requestDeleteFile(fileInfo);

						if (lightbox && lightbox.images && lightbox.images.length > 0) {
							const currentIndex = lightbox.index;
							
							lightbox.images.splice(currentIndex, 1);

							if (lightbox.images.length === 0) {
								lightbox.close();
							} else {
								const isNewestFirst = (app.ui.settings.getSettingValue?.("pysssss.ImageFeed.Direction") || localStorage.getItem("pysssss.ImageFeed.Direction")) !== "oldest first";

								let targetIndex;
								if (isNewestFirst) {
									if (currentIndex < lightbox.images.length) {
										targetIndex = currentIndex;
									} else {
										targetIndex = currentIndex - 1;
									}
								} else {
									if (currentIndex > 0) {
										targetIndex = currentIndex - 1;
									} else {
										targetIndex = 0;
									}
								}

								lightbox.index = targetIndex;
								await lightbox.update(0);
							}
						} else {
							lightbox.close();
						}

						window.dispatchEvent(new Event("resize"));
					}
				})
			]);

			lightboxEl.appendChild(lightboxActions);
		}

		async function restoreGalleryFromLocalStorage(listElement) {
			const stored = localStorage.getItem("pysssss.ImageFeed.PersistedImages");
			if (!stored) return;

			try {
				const saved = JSON.parse(stored);
				if (!Array.isArray(saved) || saved.length === 0) return;

				isRestoring = true;
				listElement.replaceChildren();

				for (const img of saved) {
					const href = `./view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${encodeURIComponent(img.subfolder)}&t=${+new Date()}`;
					
					const item = $el("div.pysssss-image-item", [
						$el("a", {
							target: "_blank",
							href,
							onclick: (e) => {
								const imgs = [...listElement.querySelectorAll("img")].map((i) => i.getAttribute("src"));
								lightbox.show(imgs, imgs.indexOf(href));
								e.preventDefault();
							}
						}, [
							$el("img", { src: href })
						])
					]);

					listElement.appendChild(item);
				}
			} catch (e) {
				console.warn("Failed to restore image feed from localStorage", e);
			} finally {
				setTimeout(() => {
					isRestoring = false;
					saveGalleryToLocalStorage();
				}, 100);
			}
		}
		
		function fixOriginalMenuButtonBug() {
			const isVisible = localStorage.getItem("pysssss.ImageFeed.Visible") !== "0";
			if (isVisible) {
				const buttons = Array.from(document.querySelectorAll("button, .comfy-menu-btn, .comfy-settings-btn"));
				const showFeedBtn = buttons.find(btn => 
					btn.textContent.includes("Show Image Feed") || 
					btn.title?.includes("Show Image Feed") ||
					btn.querySelector?.("[title*='Show Image Feed']")
				);
				if (showFeedBtn) showFeedBtn.style.display = "none";
			}
		}

		api.addEventListener("executed", async ({ detail }) => {
			if (detail?.output?.images) {
				trulyNewestImages.clear();
				const imagesToRegister = [];

				for (const img of detail.output.images) {
					if (img.filename) {
						trulyNewestImages.add(img.filename);
						imagesToRegister.push({
							filename: img.filename,
							type: img.type || "output",
							subfolder: img.subfolder || ""
						});
					}
				}

				saveTrulyNewestToLocalStorage();

				if (imagesToRegister.length > 0) {
					try {
						await api.fetchApi("/pysssss/image-feed/register", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ images: imagesToRegister })
						});
					} catch (e) {
						console.warn("Failed to register new images to backend.", e);
					}
				}
			}
		});

		function observeFeedList(listElement) {
			const listObserver = new MutationObserver((mutations) => {
				let changed = false;
				for (const mutation of mutations) {
					for (const node of mutation.addedNodes) {
						if (node.tagName === "DIV") {
							injectGalleryButtons(node);
							changed = true;
						}
					}
					if (mutation.removedNodes.length > 0) changed = true;
				}
				if (changed) queueSave();
			});

			listObserver.observe(listElement, { childList: true });
			restoreGalleryFromLocalStorage(listElement);
		}

		const bodyObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (!node.classList) continue;
					
					if (node.classList.contains("pysssss-image-feed-list")) {
						observeFeedList(node);
					} else if (node.querySelector) {
						const list = node.querySelector(".pysssss-image-feed-list");
						if (list) observeFeedList(list);
					}

					if (node.classList.contains("pysssss-lightbox")) {
						injectLightboxButtons(node);
					} else if (node.querySelector) {
						const lightboxEl = node.querySelector(".pysssss-lightbox");
						if (lightboxEl) injectLightboxButtons(lightboxEl);
					}
				}
			}
		});

		bodyObserver.observe(document.body, { childList: true, subtree: true });

		const existingList = document.querySelector(".pysssss-image-feed-list");
		if (existingList) observeFeedList(existingList);
		const existingLightbox = document.querySelector(".pysssss-lightbox");
		if (existingLightbox) injectLightboxButtons(existingLightbox);
		
		restoreTrulyNewestFromLocalStorage();
		
		setTimeout(fixOriginalMenuButtonBug, 100);
		setTimeout(fixOriginalMenuButtonBug, 500);
		setTimeout(fixOriginalMenuButtonBug, 1000);
	}
});