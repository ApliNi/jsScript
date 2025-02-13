// ==UserScript==
// @name         下载推特回复数据
// @namespace    aplini.下载推特回复数据
// @version      0.1.0
// @description  打开推特任意账号的回复页面, 点击右上角 "开始抓取" 按钮, 等待自动结束即可
// @author       ApliNi
// @match        https://x.com/*
// ==/UserScript==

(function() {
    'use strict';
    
    let stop = false;
    let map = {};
    let userId = '??';

    const on = async () => {

        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const getTweetData = (box) => {
            const url = box.querySelector('a > time')?.parentNode?.href;
            if(!url) return null;

            const nameBox = box.querySelector('div[data-testid="User-Name"]');
            const twTextBox = box.querySelector('div[data-testid="tweetText"]');
            const twPhotoList = [...box.querySelectorAll('div[data-testid="tweetPhoto"]')];

            return {
                url: url,
                data: {
                    time: box.querySelector('a > time').getAttribute('datetime'),
                    id: nameBox.querySelector('div > a').href.split('/').pop(),
                    name: nameBox.querySelector('div > a span').innerText,

                    replyUser: `${box.querySelector('div > a > span')?.innerText || ''}`.split('@').pop() || null,
                    for: {},

                    text: twTextBox?.innerText || null,
                    photos: twPhotoList.map(el => {
                        const video = el.querySelector('video[poster^="http"]');
                        const img = el.querySelector('img[src^="http"]');
                        if(video){
                            const src = video.src || video.querySelector('source')?.src;
                            if(!src){
                                console.log(`[错误] 未找到视频源`, el);
                            }
                            return {
                                ariaLabel: video.getAttribute('aria-label'),
                                poster: video.poster,
                                src: src,
                                type: video.getAttribute('type') || video.querySelector('source')?.getAttribute('type'),
                            }
                        }else if(img){
                            return {
                                alt: img.alt,
                                src: img.src,
                            }
                        }else{
                            console.log(`[错误] 未找到媒体元素`, el);
                        }
                    }),
                },
            };
        };

        // console.time('  - [耗时]');

        // 通过分隔符查找作者自己发送的推文
        const boxList = [...document.querySelectorAll('div > div[data-testid="cellInnerDiv"] > div[role="separator"]')].map(el => el.parentNode);
        for(const box of boxList){
            const d1 = getTweetData(box);
            if(!d1) continue;
            map[d1.url] = d1.data;
            userId = d1.data.id;

            // 保存推文的引用
            let upBox = box;
            while(true){
                upBox = upBox.previousElementSibling;
                if(upBox && !upBox.querySelector('& > div[role="separator"]')){
                    const d2 = getTweetData(upBox);
                    if(!d2) break;
                    map[d1.url].for[d2.url] = d2.data;
                }else{
                    break;
                }
            }
        }

        // console.timeEnd('  - [耗时]');

        await sleep(200);
        if(!stop) queueMicrotask(on);
    };

    const shadow = document.body.appendChild(document.createElement('div')).attachShadow({ mode: 'open' });
    const root = shadow.appendChild(document.createElement('div'));
    const btn = document.createElement('div');
    btn.textContent = '开始抓取';
    btn.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        padding: 10px 15px;
        background-color: #06b0ff;
        color: #fff;
        border-radius: 5px;
        cursor: default;
        z-index: 9999;
        display: none;
    `;

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

            btn.classList.remove('--open');
            btn.textContent = '开始抓取';
            btn.style.backgroundColor = '#06b0ff';
        }else{
            btn.classList.add('--open');
            btn.textContent = '保存数据';
            btn.style.backgroundColor = '#F88C00';
            
            map = {};
            stop = false;
            on();

            let lastY = 0;
            let repeatCount = 0;
            scrollInterval = setInterval(() => {
                if(window.scrollY === lastY){
                    repeatCount++;
                    if(repeatCount >= 10){
                        btn.click();
                    }
                }
                lastY = window.scrollY;
                window.scrollBy({
                    top: 350,
                    left: 0,
                    behavior:'smooth',
                });
            }, 350);
        }
    });
    root.appendChild(btn);

    // 监听 url 变化
    setInterval(() => {
        const urlPath = window.location.pathname;
        if(/^\/([^\/]+)\/with_replies/.test(urlPath)){
            btn.style.display = 'block';
        }else{
            btn.style.display = 'none';
        }
    }, 200);


})();
