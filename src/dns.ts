import type { DnsConfig, SnifferConfig } from "./types";

/**
 * 1. 默认的 fake-ip 过滤域名列表。
 * 完美配合 Clash Mi 运行的 Loyalsoldier 规则集，将国内直连域名(geosite:cn)直接排除在 fake-ip 之外。
 */
const FAKE_IP_FILTER = [
    "geosite:private",
    "geosite:connectivity-check",
    "geosite:cn",                 // ✨ 关键：让所有国内域名直接解析为真实 IP，不转成 Fake-IP
    "Mijia Cloud",
    "://mi.com",
    "://qq.com",
    "*.icloud.com",
    "*.stun.*.*",
    "*.stun.*.*.*",
];

/**
 * 2. 嗅探器配置。
 * 针对 Clash Mi 内核完全优化的嗅探逻辑。
 */
export const snifferConfig: SnifferConfig = {
    sniff: {
        TLS: { ports: [443, 8443] },
        HTTP: { ports: [80, 8080, 8880] },
        QUIC: { ports: [443, 8443] },
    },
    "override-destination": false,
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ipaddress": true, // ✨ 新增：辅助 no-resolve 规则，快速还原纯 IP 的域名
    "skip-domain": ["Mijia Cloud", "://mi.com", "+.push.apple.com"],
};

interface BuildDnsConfigInput {
    mode: "redir-host" | "fake-ip";
    ipv6Enabled: boolean;
    fakeIpFilter?: string[];
}

function buildDnsConfig({ mode, ipv6Enabled, fakeIpFilter }: BuildDnsConfigInput): DnsConfig {
    // 注：若 TypeScript 编译器报错提示缺少字段，请在你的 types.ts -> DnsConfig 接口中
    // 追加可选属性: "nameserver-policy"?: any; "fallback-filter"?: any; "fast-dns"?: boolean;
    const config: any = { 
        enable: true,
        ipv6: ipv6Enabled,
        "prefer-h3": true,
        "enhanced-mode": mode,
        
        // 基础引导 DNS
        "default-nameserver": [
            "223.5.5.5", 
            "119.29.29.29"
        ],
        
        // 主 DNS：全面更换为国内抗干扰的加密 DoH 节点
        nameserver: [
            "system",
            "https://alidns.com", 
            "https://doh.pub",         
        ],
        
        // 国外备用 DNS
        fallback: [
            "quic://dns0.eu",
            "https://cloudflare.com",
            "https://dns.sb",
        ],

        // 3. ✨ 核心分流：彻底解决国内慢的问题
        // 告诉 Clash Mi 内核：只要是国内的网站（geosite:cn）和苹果服务，直接用国内大厂 DoH 解析
        // 这一步会切断与国外 fallback 的竞速，国内网站全部实现毫秒级“秒开”
        "nameserver-policy": {
            "geosite:cn": ["https://alidns.com", "https://doh.pub"],
            "geosite:apple": ["https://alidns.com", "https://doh.pub"],
            "geosite:private": ["system"],
            "Mijia Cloud,://mi.com": ["system"]
        },

        // 4. ✨ Mihomo 防污染过滤器
        "fallback-filter": {
            geoip: true,
            "geoip-code": "CN",
            ipcidr: ["240.0.0.0/4"]
        },

        // 5. ✨ Mihomo 专属快拨
        // 谁先解析完就用谁的结果，不再死等国外回应
        "fast-dns": true,

        "proxy-server-nameserver": ["https://alidns.com", "tls://dot.pub"],
    };

    if (fakeIpFilter) {
        config["fake-ip-filter"] = fakeIpFilter;
    }

    return config;
}

export interface BuildDnsInput {
    fakeIPEnabled: boolean;
    ipv6Enabled: boolean;
}

export function buildDns({ fakeIPEnabled, ipv6Enabled }: BuildDnsInput): DnsConfig {
    if (fakeIPEnabled) {
        return buildDnsConfig({ mode: "fake-ip", ipv6Enabled, fakeIpFilter: FAKE_IP_FILTER });
    }
    return buildDnsConfig({ mode: "redir-host", ipv6Enabled });
}
