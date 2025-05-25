export const config = {
  // 系统常量配置
  // 包含网站状态码、数据文件路径等基础系统配置
  base: {
    // 调试仓库地址（线上使用请设置为空）
    debug_repo: 'xaoxuu/friends',
    // 有效状态（会被生成到数据文件中）
    valid_labels: {
      unknown: '未知', // 无法判断（403，可能是反爬虫机制造成）
      redirect: '重定向' // 重定向
    },
    // 无效状态（不会被生成到数据文件中）
    invalid_labels: {
      invalid_theme: '主题无效',
      unreachable: '无法访问' // 无法访问（404或其它无法访问的状态码）
    },
    // 数据文件存储路径
    // 用于存储解析后的网站数据
    paths: {
      data: 'v2/data.json'
    },
    // 数据结构版本号
    // 用于处理数据格式升级和向后兼容
    data_version: 'v2'
  },

  // 生成器配置
  // 用于从GitHub Issues中提取网站信息
  generator: {
    // 是否启用生成器
    enabled: true,
    
    // Issue排序方式
    // updated/created: 更新时间/创建时间
    sort: 'created',
    // desc/asc: 降序/升序
    direction: 'desc',
    
    // 需要排除的Issue标签
    // 包含这些标签的Issue将不会被解析
    exclude_labels: ["审核中"],
  },

  // 链接检查器配置
  // 用于检查网站是否包含指定链接
  link_checker: {
    // 是否启用链接检查
    enabled: true,
    // 包含这些关键词的Issue将被检查
    include_keyword: '# 友链信息',
    // 包含这些标签的Issue将不会被检查
    exclude_labels: ["审核中", "缺少互动", "缺少文章", "风险网站"],

    // 目标链接
    // 检查网站是否包含此链接
    targetLink: 'https://xaoxuu.com',
    
  },

  // 主题检查器配置
  // 用于定期检查已收录网站的可访问性和主题使用状态
  theme_checker: {
    // 是否启用网站主题检查
    enabled: false,

    // 包含这些关键词的Issue将被检查
    include_keyword: '# 站点信息',
    // 包含这些标签的Issue将不会被检查
    exclude_labels: ["审核中", "风险网站"],

    // 主题标识meta标签选择器
    meta_tag: 'meta[name="hexo-theme"]',
    // 期望的主题名称
    theme_name: 'Stellar',
    // 主题版本号属性名
    version_attr: 'theme-version',
    // 主题名称属性名
    name_attr: 'theme-name',
    // 主题内容属性名
    content_attr: 'content',

  },

  // 网络请求配置
  // 用于模拟真实用户访问，避免被目标网站拦截
  request: {
    // 随机User-Agent列表
    // 每次请求随机选择一个User-Agent
    user_agents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36'
    ],
    // 请求头配置
    // 模拟浏览器的标准请求头
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      accept_language: 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      accept_encoding: 'gzip, deflate, br',
      cache_control: 'no-cache',
      pragma: 'no-cache',
      dnt: '1',
      sec_ch_ua: '" Not A;Brand";v="99", "Chromium";v="91", "Google Chrome";v="91"',
      sec_ch_ua_mobile: '?0',
      sec_fetch_dest: 'document',
      sec_fetch_mode: 'navigate',
      sec_fetch_site: 'none',
      sec_fetch_user: '?1',
      upgrade_insecure_requests: '1'
    },

    // 请求延迟配置
    // 用于控制请求频率，避免对目标站点造成压力
    delay: {
      min: 1000,  // 最小延迟时间（毫秒）
      max: 5000   // 最大延迟时间（毫秒）
    },

    // 请求超时时间（毫秒）
    // 超过此时间未响应则判定为无法访问
    timeout: 10000,
    // 检查失败时的重试次数
    retry_times: 3
  },

};