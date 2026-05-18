# TGROUP与TUSER表

## TGROUP 表

`TGROUP` 表是自定义的班组定义表，用于将 SAP 中的工作中心（`arbpl`）映射到业务班组。在 `sap 解锁.txt` 的 SQL 查询中，`TGROUP` 表被用来：

1. 过滤工作中心：`f.arbpl in (select arbpl from TGROUP)` 或 `substr(f.arbpl,0,2)='WX'`。
2. 获取班组信息：`t.groupname PXXM`、`t.groupname`、`t.wxgroup`（外发组类型）。
3. 外发加工分类：根据 `wxgroup` 的值（如 `'缝制确认'`、`'拼缝确认'`、`'服饰确认'`、`'水洗确认'`、`'后整确认'`），决定从哪个视图（`V_FACTORY_MIS_WX`）中查询外发车间。

推测表结构：

| 字段名 | 含义 |
|--------|------|
| `arbpl` | 工作中心代码 |
| `groupname` | 班组名称（如“缝制组”、“包装组”） |
| `wxgroup` | 外发加工类型（仅对以 `WX` 开头的工作中心有意义） |
| 其他字段 | 可能还有车间、工厂等 |

## TUSER 表

`TUSER` 表是用户表，用于存储用户ID和姓名。在 SQL 中，它被用来获取确认人的姓名：

- `n.username QRBM` — 用户编码（可能为登陆名）
- `n.lastname QRR` — 确认人姓名
- 连接条件：`n.userid=h.confirmuserid`

推测表结构：

| 字段名 | 含义 |
|--------|------|
| `userid` | 用户唯一标识（与 `CONFIRMLIST.confirmuserid` 关联） |
| `username` | 用户名（登录名） |
| `lastname` | 姓（或全名） |
| 其他字段 | 可能还有部门、角色等 |

## 在查询中的作用

1. `TGROUP` 用于确定工序所属的班组以及外发加工的类型，从而决定计算 `GC`（工厂/车间）的逻辑。
2. `TUSER` 用于将确认记录中的用户ID转换为可读的姓名。

## 相关概念

- [[SAP工序查询与分析]]
- [[CONFIRMLIST表]]
- [[生产订单相关SAP表]]