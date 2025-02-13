// ==UserScript==
// @name         下载推特回复数据
// @namespace    aplini.下载推特回复数据
// @version      0.1.5
// @description  打开推特任意账号的回复页面, 点击右上角 "开始抓取" 按钮, 等待自动结束即可
// @author       ApliNi
// @match        https://x.com/*
// @grant        GM_getValue
// ==/UserScript==

/* ==UserConfig==

config:
  alwaysDisplayButton:
    title: 始终显示按钮 (可在其他页面使用, 但没有进行测试)
    description: 启用
    type: checkbox
    default: false
  disableAutoSave:
    title: 禁用自动保存 (开启后只能手动点击保存按钮)
    description: 启用
    type: checkbox
    default: false
  disableAutoScroll:
    title: 禁用自动滚动
    description: 启用
    type: checkbox
    default: false
  saveImageBase64:
    title: 同时保存图片的 Base64 (这可能导致文件过大或浏览器崩溃?)
    description: 启用
    type: checkbox
    default: false
  sleep:
    title: 延迟时间 (毫秒)
    description: 延迟时间
    type: number
    default: 500
  scrollYOffset:
    title: 每次滚动的距离 (像素)
    description: 距离
    type: number
    default: 700

==/UserConfig== */

(function() {
    'use strict';
	
	let map = {};
	let userId = '??';

	let imgMap = {};
	
	let stop = false;
	let lastY = 0;
	let repeatCount = 0;

	const on = async () => {

		const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

		const getTweetData = async (box, type) => {
			const url = box.querySelector('a > time')?.parentNode?.href;
			if(!url) return null;

			box.style.outline = `2px dashed #7d7d7d`;
			box.style.outlineOffset = '-6px';

			const nameBox = box.querySelector('div[data-testid="User-Name"]');
			const twTextBox = box.querySelector('div[data-testid="tweetText"]');
			const twPhotoList = [...box.querySelectorAll('div[data-testid="tweetPhoto"]')];

			const photos = [];
			for(const photo of twPhotoList){
				const video = photo.querySelector('video[poster^="http"]');
				const img = photo.querySelector('img[src^="http"]');
				if(video){
					const src = video.src || video.querySelector('source')?.src;
					if(!src){
						console.log(`[错误] 未找到视频源`, photo);
					}
					photos.push({
						ariaLabel: video.getAttribute('aria-label'),
						poster: video.poster,
						src: src,
						type: video.getAttribute('type') || video.querySelector('source')?.getAttribute('type'),
					});
				}else if(img){
					const imgData = {
						alt: img.alt,
						src: img.src,
					};
					if(GM_getValue('config.saveImageBase64', false) === true){
						if(!imgMap[img.src]){
							const response = await fetch(img.src);
							const blob = await response.blob();
							const base64 = await new Promise((resolve) => {
								const reader = new FileReader();
								reader.onload = () => resolve(reader.result);
								reader.readAsDataURL(blob);
							});
							imgMap[img.src] = base64;
						}
						imgData.base64 = imgMap[img.src];
					}
					photos.push(imgData);
				}else{
					console.log(`[错误] 未找到媒体元素`, photo);
				}
			}

			const data = {
				url: url,
				data: {
					time: box.querySelector('a > time').getAttribute('datetime'),
					id: nameBox.querySelector('div > a').href.split('/').pop(),
					name: nameBox.querySelector('div > a span').innerText,

					replyUser: `${box.querySelector('div > a > span')?.innerText || ''}`.split('@').pop() || null,
					for: {},

					text: twTextBox?.innerText || null,
					photos: photos,
				},
			};

			if(type === 'main'){
				box.style.outline = `2px dashed #F88C00`;
			}else if(type ==='reply'){
				box.style.outline = `2px dashed #06b0ff`;
			}
			
			return data;
		};

		const deepMergeObject = (target, source = {}) => {

			// 合并 target 的属性到 result 中
			const result = { ...target };
		
			// 合并 source 的属性到 result 中
			for(const key in source){
				if(source.hasOwnProperty(key)){
					if(source[key] === null || source[key] === undefined){
						result[key] = source[key];
						continue;
					}
					switch(source[key].constructor){
						case Object: // 递归合并对象
							result[key] = deepMergeObject(result[key], source[key]);
							break;

						case Array: // 选择数组长度大的一方
							if(source[key].length >= (result[key]?.length || 0)){
								result[key] = source[key];
							}
							break;
					
						default:
							result[key] = source[key];
							break;
					}
				}
			}
			return result;
		};

		// console.time('  - [耗时]');

		// 通过分隔符查找作者自己发送的推文
		const boxList = [...document.querySelectorAll('div > div[data-testid="cellInnerDiv"] > div[role="separator"]')].map(el => el.parentNode);
		for(const box of boxList){
			const d1 = await getTweetData(box, 'main');
			if(!d1) continue;
			map[d1.url] = deepMergeObject(map[d1.url], d1.data);
			userId = d1.data.id;

			// 保存推文的引用
			let upBox = box;
			while(true){
				upBox = upBox.previousElementSibling;
				if(upBox && !upBox.querySelector('& > div[role="separator"]')){
					const d2 = await getTweetData(upBox, 'reply');
					if(d2){
						map[d1.url].for[d2.url] = deepMergeObject(map[d1.url].for[d2.url], d2.data);
					}
				}else{
					break;
				}
			}
		}

		// console.timeEnd('  - [耗时]');

		if(GM_getValue('config.disableAutoScroll', false) === false){
			if(window.scrollY === lastY && GM_getValue('config.disableAutoSave', false) === false){
				repeatCount++;
				if(repeatCount >= 20){
					btn.click();
				}
			}else{
				repeatCount = 0;
			}
			lastY = window.scrollY;
			window.scrollBy({
				top: GM_getValue('config.scrollYOffset', 700),
				left: 0,
				behavior:'smooth',
			});
		}

		await sleep(GM_getValue('config.sleep', 500));
		if(!stop) queueMicrotask(on);
	};

	const shadow = document.body.appendChild(document.createElement('div')).attachShadow({ mode: 'open' });
	const root = shadow.appendChild(document.createElement('div'));
	root.style.cssText = `
		position: fixed;
		top: 15px;
		right: 15px;
		z-index: 9999;
		display: none;
	`;
	const btn = document.createElement('div');
	btn.textContent = '开始抓取';
	btn.style.cssText = `
		margin: 0 0 7px auto;
		padding: 4px 7px;
		background-color: #06b0ff;
		color: #fff;
		border-radius: 3px;
		cursor: default;
		width: fit-content;
	`;
	root.appendChild(btn);

	let scrollInterval;

	btn.addEventListener('click', async () => {

		if(btn.classList.contains('--open')){
			stop = true;
			clearInterval(scrollInterval);
			const str = JSON.stringify(map, null, '\t');

			const url = URL.createObjectURL(new Blob([str], { type: 'text/plain' }));
			const a = document.createElement('a');
			a.href = url;
			a.download = `${userId}.json`;
			a.click();
			URL.revokeObjectURL(url);
			map = {};
			imgMap = {};

			btn.classList.remove('--open');
			btn.textContent = '开始抓取';
			btn.style.backgroundColor = '#06b0ff';
		}else{
			btn.classList.add('--open');
			btn.textContent = '保存数据';
			btn.style.backgroundColor = '#F88C00';
			
			stop = false;
			on();
		}
	});

	
	if(GM_getValue('config.alwaysDisplayButton', false) === false){
		// 监听 url 变化, 只在特定页面显示按钮
		setInterval(() => {
			const urlPath = window.location.pathname;
			if(/^\/([^\/]+)\/with_replies/.test(urlPath)){
				root.style.display = 'block';
			}else{
				root.style.display = 'none';
			}
		}, 200);
	}else{
		root.style.display = 'block';
	}

	const btn2 = document.createElement('div');
	btn2.textContent = '加载数据';
	btn2.style.cssText = `
		margin: 0 0 7px auto;
		padding: 4px 7px;
		background-color: #162838;
		color: #fff;
		border-radius: 3px;
		cursor: default;
		width: fit-content;
	`;
	root.appendChild(btn2);

	btn2.addEventListener('click', async () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.addEventListener('change', async () => {
			const file = input.files[0];
			if(!file) return;
			const reader = new FileReader();
			reader.readAsText(file);
			reader.onload = async () => {
				const data = JSON.parse(reader.result);
				map = data;
				userId = file.name.replace(/.json$/, '');
				btn2.textContent = `更新: ${file.name}`;
				console.log(map);
			};
		});
		input.click();
	});

})();
