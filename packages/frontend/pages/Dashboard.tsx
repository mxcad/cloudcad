import { ArrowUpRight, Clock, FileText, HardDrive, Layers } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Api } from '../services/api';
import { FileType } from '../types';

const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 mt-2">{value}</h3>
      <p className="text-xs text-slate-400 mt-1">{subtext}</p>
    </div>
    <div className={`p-3 rounded-lg ${color}`}>
      <Icon className="text-white" size={24} />
    </div>
  </div>
);

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / k ** i).toFixed(2)) + ' ' + sizes[i];
};

export const Dashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const data = await Api.dashboard.getStats();
      setStats(data);
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading)
    return <div className="p-8 text-center text-slate-500">加载数据中...</div>;

  const storageData = [
    { name: '已用', value: stats.storageUsed },
    { name: '剩余', value: stats.storageTotal - stats.storageUsed },
  ];
  const COLORS = ['#4f46e5', '#e2e8f0'];

  const activityData = [
    { name: '周一', files: 4 },
    { name: '周二', files: 7 },
    { name: '周三', files: 12 },
    { name: '周四', files: 8 },
    { name: '周五', files: 15 },
    { name: '周六', files: 3 },
    { name: '周日', files: 2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">工作台</h1>
        <div className="text-sm text-slate-500">欢迎回来，查看今日概览</div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="总项目数"
          value={stats.totalProjects}
          subtext="活跃项目"
          icon={Layers}
          color="bg-blue-500"
        />
        <StatCard
          title="存储空间"
          value={formatBytes(stats.storageUsed)}
          subtext={`共 ${formatBytes(stats.storageTotal)}`}
          icon={HardDrive}
          color="bg-indigo-500"
        />
        <StatCard
          title="文件总数"
          value={stats.totalFiles}
          subtext="本周新增 +12"
          icon={FileText}
          color="bg-emerald-500"
        />
        <StatCard
          title="最近活动"
          value="24"
          subtext="待处理审批"
          icon={Clock}
          color="bg-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Storage Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            存储使用情况
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={storageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {storageData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(val: number) => formatBytes(val)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-sm mt-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
              <span className="text-slate-600">
                已用 (
                {((stats.storageUsed / stats.storageTotal) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-200"></span>
              <span className="text-slate-600">剩余</span>
            </div>
          </div>
        </div>

        {/* Activity Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            本周上传活跃度
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b' }}
                />
                <RechartsTooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar
                  dataKey="files"
                  fill="#4f46e5"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Files */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">最近文件</h3>
          <button className="text-indigo-600 text-sm font-medium hover:text-indigo-700 flex items-center gap-1">
            查看全部 <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3">文件名</th>
                <th className="px-6 py-3">大小</th>
                <th className="px-6 py-3">类型</th>
                <th className="px-6 py-3">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentFiles.map((file: any) => (
                <tr
                  key={file.id}
                  className="border-b border-slate-50 hover:bg-slate-50/50"
                >
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2">
                    {/* Simple Icon Logic */}
                    <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <FileText size={16} />
                    </div>
                    {file.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatBytes(file.size)}
                  </td>
                  <td className="px-6 py-4 text-slate-500 uppercase">
                    {file.type}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(file.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
