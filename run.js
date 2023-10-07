/**
 * @author zhangxinxu(.com)
 * @version -
 * @create 2023-09-21
*/

const fs = require('fs');
stat = fs.stat;

const path = require('path');
const url = require('url');

const http = require('http');

const promise = (fn) => (...params) => new Promise((resolve, reject) => {
    fn(...params, function (err, ...res) {
		if (err) {
			reject(err);
		} else {
			resolve(...res);
		}
	})

})

const fs_stat = promise(fs.stat);
const fs_readFile = promise(fs.readFile);
const fs_readdir = promise(fs.readdir);
const fs_unlink = promise(fs.unlink);
const fs_rmdir = promise(fs.rmdir);
const fs_mkdir = promise(fs.mkdir);
const fs_writeFile = promise(fs.writeFile);

/*
** 创建路径对应的文件夹（如果没有）
** @params path 目标路径
*/
const createPath = async function (path) {
	// 路径有下面这几种
	// 1. /User/...      OS X
	// 2. E:/mydir/...   window
	// 3. a/b/...        下面3个相对地址，与系统无关
	// 4. ./a/b/...
	// 5. ../../a/b/...

	path = path.replace(/\\/g, '/');

	var pathHTML = '.';
	if (path.slice(0,1) == '/') {
		pathHTML = '/';
	} else if (/:/.test(path)) {
		pathHTML = '';
	}

	path.split('/').forEach( async function(filename) {
		if (filename) {
			// 如果是数据盘地址，忽略
			if (/:/.test(filename) == false) {
				pathHTML = pathHTML + '/' + filename;
				// 如果文件不存在
				if(!fs.existsSync(pathHTML)) {
					console.log('路径' + pathHTML + '不存在，新建之');
					// fs.mkdirSync(pathHTML);
					await fs_mkdir(pathHTML)
				}
			} else {
				pathHTML = filename;
			}
		}
	});
}

/*
 * 复制目录中的所有文件包括子目录
 * @param{ String } 需要复制的目录
 * @param{ String } 复制到指定的目录
 */
const copy = async function (src, dst) {
	if (!fs.existsSync(src)) {
		return;
	}
    // 目标目录不存在，新建之
    if (!fs.existsSync(dst)) {
        await createPath(dst);
    }

	// 读取目录中的所有文件/目录
	var paths = await fs_readdir(src);

	paths.forEach( async function (dir) {
		var _src = path.join(src, dir),
			_dst = path.join(dst, dir),
			readable, writable;

		let st = await fs_stat(_src);

		// 判断是否为文件
		if (st.isFile()) {
			// 创建读取流
			readable = fs.createReadStream(_src);
			// 创建写入流
			writable = fs.createWriteStream(_dst);
			// 通过管道来传输流
			readable.pipe(writable);
		} else if (st.isDirectory()) {
			// 作为文件夹处理
			await createPath(_dst);
			await copy(_src, _dst);
		}
	});
};

/*
** 删除文件极其目录方法
** @src 删除的目录
*/
const clean = async function (src) {
	if (!fs.existsSync(src)) {
		return;
	}

	// 读取目录中的所有文件/目录
	var paths = await fs_readdir(src);

	paths.forEach( async function (dir) {
		let _src = path.join(src, dir);

		let st = await fs_stat(_src);

		if (st.isFile()) {
			// 如果是文件，则删除
			// fs.unlinkSync(_src);
			await fs_unlink(_src)
		} else if (st.isDirectory()) {
			// 作为文件夹
			await clean(_src);
		}
	});

	// 删除文件夹
	try {
		await fs_rmdir(src)
		// fs.rmdirSync(src);
		console.log('已清空文件夹' + src);
	} catch(e) {}
};

/*
** html文件import编译方法
** @src String html开发目录
** @dist String html编译目录
*/
const compile = async function (src, dist) {
	// 遍历文件夹下的文件
	const _src = await fs_readdir(src);
	_src.forEach( async function (filename) {
		if (/\.html$/.test(filename)) {
			// .html文件才处理
			// 读文件内容
			let data = await fs_readFile(path.join(src, filename), {
				// 需要指定编码方式，否则返回原生buffer
				encoding: 'utf8'
			})

			// 下面要做的事情就是把
			// <link rel="import" href="header.html">
			// 这段HTML替换成href文件中的内容
			let arrQuery = [];
			// 可以求助万能的正则
			const promises = [];
			data.replace(/<link\srel="import"\shref="(.*)">/gi, function (matchs, m1) {
				// m1就是匹配的路径地址了
				let roots = m1.split('?')[0];

				if (m1 !== roots) {
					arrQuery.push(m1.split('?')[1]);
				}
				promises.push(fs_readFile(path.join(src, roots),{
					encoding: 'utf8'
				}));
			});

			await Promise.all(promises).then(results => {
				data = data.replace(/<link\srel="import"\shref="(.*)">/gi, () => results.shift())
			})

			if (arrQuery.length) {
				arrQuery.forEach(function (query) {
					// 查询与替换
					query.split('&').forEach(function (parts) {
						let key = parts.split('=')[0];
						let value = parts.split('=')[1] || '';

						data = data.replace('$' + key + '$', value);
					});
				});
			}

			// 替换多余的变量
			data = data.replace(/\$\w+\$/g, '');

			// 于是生成新的HTML文件
			await fs_writeFile(path.join(dist, filename), data, {
				encoding: 'utf8'
			})

			console.log(filename + '生成成功！');

			await fs_readFile(path.join(src, filename), {
				// 需要指定编码方式，否则返回原生buffer
				encoding: 'utf8'
			})
		}
	});
};

const pathSrcAssets = './src/assets/';
const pathDistAssets = './docs/assets/';
const pathSrcHTML = './src/views/';
const pathDistHTML = './docs/';

// 任务
const task = {
	assets: {
        // 静态资源直接复制过去
		init: async function () {
			// 资源清理
			await clean(pathDistAssets);
			console.log('复制静态资源中...');
            copy(pathSrcAssets, pathDistAssets);
		}
	},
	html: {
		compile: async function () {
            const dirSrc = await fs_readdir(pathSrcHTML);
            dirSrc.forEach(async dir => {
                let st = await fs_stat(path.join(pathSrcHTML, dir));
                if (st.isDirectory(dir) && /^\d+$/.test(dir)) {
                    const distDir = path.join(pathDistHTML, dir);
                    if (!fs.existsSync(distDir)) {
                        await createPath(distDir);
                    }
                    await compile(path.join(pathSrcHTML, dir), distDir);
                }
            });	
		},
        // 首页的编译
        home: function () {
            compile(pathSrcHTML, pathDistHTML);
        },
		init: async function () {
			// 删除对应文件夹
            // 所有数字文件夹处理
            const dirDist = await fs_readdir(pathDistHTML);
            dirDist.forEach(async dir => {
                let st = await fs_stat(path.join(pathDistHTML, dir));
                if (st.isDirectory(dir) && /^\d+$/.test(dir)) {
                    await clean(path.join(pathDistHTML, dir));
                }
            });

			this.compile();
		}
	}
};


// 一开始第一次任务
task.assets.init();
task.html.init();
task.html.home();


// 静态资源监控任务
let timerAssets;
fs.watch(pathSrcAssets, {
	recursive: true
}, (eventType, filename) => {
	// 定时器让多文件同时变更只会只会执行一次合并
	clearTimeout(timerAssets);
	console.log(filename + '发生了' + eventType + '变化');

    timerAssets = setTimeout(() => {
        console.log('静态资源同步成功');
       
        task.assets.init();
    }, 100);
});

// HTML监控任务
let timerHTML;
fs.watch(pathSrcHTML, {
	recursive: true
}, (eventType, filename) => {
	clearTimeout(timerHTML);

	console.log(filename + '发生了' + eventType + '变化');


    if (filename == 'index.html') {
        task.assets.home();
    } else {
        timerHTML = setTimeout(() => {
			const fullPath = path.join(pathSrcHTML, filename);
			if (/include/.test(fullPath)) {
				task.html.init();
			} else {
				dir = filename.split(/\/|\\/)[0];
				compile(path.join(pathSrcHTML, dir), path.join(pathDistHTML, dir));
			}
             
            console.log('HTML编译执行...');
        }, 100);
    }
});

setTimeout(function () {
	console.log('静态资源全面监控中...');
}, 200);


let mimetype = {
  'css': 'text/css',
  'gif': 'image/gif',
  'html': 'text/html',
  'ico': 'image/x-icon',
  'jpeg': 'image/jpeg',
  'jpg': 'image/jpeg',
  'webp': 'image/webp',
  'js': 'text/javascript',
  'json': 'application/json',
  'pdf': 'application/pdf',
  'png': 'image/png',
  'svg': 'image/svg+xml',
  'swf': 'application/x-shockwave-flash',
  'woff': 'application/font-woff',
  'woff2': 'application/font-woff2',
  'ttf': 'application/x-font-ttf',
  'eot': 'application/vnd.ms-fontobject',
  'txt': 'text/plain',
  'wav': 'audio/x-wav',
  'mp3': 'audio/mpeg3',
  'mp4': 'video/mp4',
  'xml': 'text/xml'
};

// 创建server
let server = http.createServer(function (request, response) {
	var parse = url.parse(request.url);
	var pathname = parse.pathname;
	var query = parse.query;

	var realPath = path.join('docs', pathname);
	var ext = path.extname(realPath);
	if (!ext) {
    	realPath = path.join(realPath, 'index.html');
    	ext = path.extname(realPath);
    }
	ext = ext ? ext.slice(1) : 'unknown';
	fs.exists(realPath, function (exists) {
		if (!exists) {
			response.writeHead(404, {
				'Content-Type': 'text/plain'
			});

			response.write('This request URL ' + pathname + ' was not found on this server.');
			response.end();
		} else {
			fs.readFile(realPath, 'binary', function (err, file) {
				if (err) {
					response.writeHead(500, {
						'Content-Type': 'text/plain'
					});
					response.end(err);
				} else {
					var contentType = mimetype[ext] || 'text/plain';
					response.writeHead(200, {
						'Content-Type': contentType
					});
					response.write(file, 'binary');
					response.end();
				}
			});
		}
	});
});

// 设置监听端口
server.listen(2001, '127.0.0.1', function () {
	console.log('服务已经启动，访问地址为：\nhttp://127.0.0.1:2001' +'/index.html');
});