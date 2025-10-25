import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Wallet, TrendingUp, TrendingDown, DollarSign, Plus, Trash2, Download, PieChart } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CATEGORY_OPTIONS = [
  'Salary', 'Freelance', 'Investment', 'Other Income',
  'Food', 'Rent', 'Utilities', 'Transportation', 
  'Entertainment', 'Healthcare', 'Shopping', 'Education', 'Other Expense'
];

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FFEB3B', '#795548'];

const Dashboard = () => {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ total_income: 0, total_expense: 0, net_balance: 0, transaction_count: 0 });
  const [analytics, setAnalytics] = useState({ expense_by_category: [], income_by_category: [] });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: '',
    type: 'expense'
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [transRes, summaryRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/transactions`),
        axios.get(`${API}/summary`),
        axios.get(`${API}/analytics`)
      ]);
      setTransactions(transRes.data);
      setSummary(summaryRes.data);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.category || !formData.description || !formData.amount) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/transactions`, {
        ...formData,
        amount: parseFloat(formData.amount)
      });
      toast.success('Transaction added successfully!');
      setIsDialogOpen(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '',
        description: '',
        amount: '',
        type: 'expense'
      });
      fetchAllData();
    } catch (error) {
      console.error('Error adding transaction:', error);
      toast.error('Failed to add transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/transactions/${id}`);
      toast.success('Transaction deleted');
      fetchAllData();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast.error('Failed to delete transaction');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await axios.post(`${API}/reports/pdf`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `expense_report_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Report downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download report');
    }
  };

  const expenseChartData = analytics.expense_by_category.map(item => ({
    name: item.category,
    value: item.amount
  }));

  const incomeChartData = analytics.income_by_category.map(item => ({
    name: item.category,
    value: item.amount
  }));

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 fade-in-up">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-800 mb-2" data-testid="dashboard-title">
                Expense Tracker
              </h1>
              <p className="text-base sm:text-lg text-gray-600">Manage your finances with ease</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleDownloadPDF}
                variant="outline"
                className="rounded-full border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                data-testid="download-pdf-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Report
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg"
                    data-testid="add-transaction-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Transaction
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]" data-testid="add-transaction-dialog">
                  <DialogHeader>
                    <DialogTitle>Add New Transaction</DialogTitle>
                    <DialogDescription>
                      Record your income or expense here.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="type">Type</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger data-testid="transaction-type-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense" data-testid="type-expense">Expense</SelectItem>
                          <SelectItem value="income" data-testid="type-income">Income</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        data-testid="transaction-date-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger data-testid="transaction-category-select">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((cat) => (
                            <SelectItem key={cat} value={cat} data-testid={`category-${cat.toLowerCase().replace(/\s+/g, '-')}`}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        placeholder="Enter description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        data-testid="transaction-description-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="amount">Amount ($)</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        data-testid="transaction-amount-input"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-emerald-500 hover:bg-emerald-600"
                      disabled={loading}
                      data-testid="submit-transaction-btn"
                    >
                      {loading ? 'Adding...' : 'Add Transaction'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 slide-in-right" data-testid="summary-cards">
          <Card className="glass-card p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Income</p>
                <h3 className="text-2xl sm:text-3xl font-bold text-emerald-600" data-testid="total-income">
                  ${summary.total_income.toFixed(2)}
                </h3>
              </div>
              <div className="p-3 bg-emerald-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </Card>

          <Card className="glass-card p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Expenses</p>
                <h3 className="text-2xl sm:text-3xl font-bold text-red-500" data-testid="total-expenses">
                  ${summary.total_expense.toFixed(2)}
                </h3>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <TrendingDown className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </Card>

          <Card className="glass-card p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Net Balance</p>
                <h3 className={`text-2xl sm:text-3xl font-bold ${summary.net_balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`} data-testid="net-balance">
                  ${summary.net_balance.toFixed(2)}
                </h3>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Wallet className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="glass-card p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Transactions</p>
                <h3 className="text-2xl sm:text-3xl font-bold text-purple-600" data-testid="transaction-count">
                  {summary.transaction_count}
                </h3>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <DollarSign className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="glass-card p-6" data-testid="expense-chart-card">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Expenses by Category
            </h3>
            {expenseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RePieChart>
                  <Pie
                    data={expenseChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expenseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                No expense data available
              </div>
            )}
          </Card>

          <Card className="glass-card p-6" data-testid="income-chart-card">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Income by Category
            </h3>
            {incomeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RePieChart>
                  <Pie
                    data={incomeChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#82ca9d"
                    dataKey="value"
                  >
                    {incomeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                No income data available
              </div>
            )}
          </Card>
        </div>

        {/* Transactions List */}
        <Card className="glass-card p-6" data-testid="transactions-list-card">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Recent Transactions</h3>
          <div className="overflow-x-auto">
            {transactions.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Category</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Description</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Amount</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-600">Type</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`transaction-${transaction.id}`}>
                      <td className="py-3 px-4 text-sm text-gray-700">{transaction.date}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{transaction.category}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{transaction.description}</td>
                      <td className={`py-3 px-4 text-sm text-right font-semibold ${transaction.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                        ${transaction.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${transaction.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {transaction.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(transaction.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          data-testid={`delete-transaction-${transaction.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400" data-testid="no-transactions-message">
                <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No transactions yet</p>
                <p className="text-sm">Click "Add Transaction" to get started</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
