# CONFIRMLIST表

`CONFIRMLIST` 是 SAP 系统中的一张自定义确认表（可能是 Z 表或用户自定义表），用于存储生产订单工序的确认信息，包括各项数量、确认人员、确认时间等。本文档基于 `sap 解锁.txt` 中的 SQL 查询分析其字段含义。

## 表结构猜测

根据 SQL 中的 `nvl(h.字段,0)` 以及 `SELECT` 语句中的字段列表，可以推断该表至少包含以下字段：

| 字段名（SQL中） | 推测含义 |
|----------------|----------|
| `aufnr` | 生产订单号 |
| `arbpl` | 工作中心 |
| `gxbh` | 工序号（与 `vornr` 对应） |
| `agvrg` | 已确认数量（可能是 '已确认' 的拼音缩写） |
| `lmnga` | 数量（可能是 '累计完工' ？） |
| `dyzp` | 打印张数或某类数量 |
| `amnga` | 确认数量 |
| `abcy` | 不良品数量或次品数 |
| `xzbzt` | 小组包装状态？ |
| `cpbcs` | 产品部参数？ |
| `cpbly` | 产品部比例？ |
| `gsjkhy` | 工时核查后？ |
| `dmnga` | 待确认数量？ |
| `xmnga` | 项目数量？ |
| `slhj` | 数量合计 |
| `kysl` | 可用数量 |
| `sxdsl` | 上下道数量（`nvl(h.sxdsl,0)+nvl(h.abcy,0)`） |
| `ZLKKSL` | 质量扣款数量？ |
| `BZ` | 备注 |
| `confirmdate` | 确认日期（字段名可能为 `confirmdate`） |
| `confirmuserid` | 确认用户ID（关联 `TUSER` 表） |
| `autoflag` | 自动确认标志 |

## 字段用途示例

在查询中，大量使用 `nvl(字段,0)` 将 `NULL` 转为 `0`，说明这些数量字段允许为空。`CONFIRMLIST` 表是连接工序与确认人、数量的核心表。

## 相关操作

脚本中包含几条对 `CONFIRMLIST` 的操作：

1. `SELECT * FROM CONFIRMLIST WHERE aufnr='010000066445'` — 查看某订单的所有确认记录。
2. `UPDATE CONFIRMLIST SET =0 WHERE aufnr='010000066445' AND ARBPL='0007CPB' and =30` — 疑似将某字段置为0（但 `SET =0` 缺少字段名，可能是笔误）。
3. `UPDATE CONFIRMLIST SET =30 WHERE aufnr='010000066445' AND ARBPL='WXFZ'` — 类似。

这些操作可能用于调整确认数据。

## 关系

`CONFIRMLIST` 通过 `aufnr`、`arbpl`、`gxbh` 与生产订单工序关联，通过 `confirmuserid` 与 `[[TGROUP与TUSER表]]` 中的 `TUSER` 表关联。

## 相关概念

- [[SAP工序查询与分析]]
- [[TGROUP与TUSER表]]
- [[生产订单相关SAP表]]