import { Box, Container } from '@mui/material';
import { ChatProvider } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import ChatFab from './ChatFab';
import ChatSidebar from './ChatSidebar';
import ChatWindowModern from './ChatWindowModern';
import ChatContextSelector from './ChatContextSelector';
import { Header } from './layout/Header';
import { chatApi } from '../services/chatApi';

export function Layout({ children }: { children: React.ReactNode }) {
	const { user } = useAuth();
	const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
	const [chatSelectorOpen, setChatSelectorOpen] = useState(false);
	const [selectedContextType, setSelectedContextType] = useState<'quicket_item' | 'trip' | 'direct' | null>(null);
	const [openChats, setOpenChats] = useState<Array<{ chatId: string; contextType: string }>>([]);
	const [totalUnreadCount, setTotalUnreadCount] = useState(0);

	const handleChatSelect = (chatId: string, contextType: string = 'direct') => {
		setChatSidebarOpen(false);
		const existingChat = openChats.find((c) => c.chatId === chatId);
		if (!existingChat) {
			setOpenChats([...openChats, { chatId, contextType }]);
		} else {
			// If chat already open, bring it to front
			setOpenChats([...openChats.filter((c) => c.chatId !== chatId), { chatId, contextType }]);
		}
	};

	const handleNewChat = (contextType: string) => {
		setSelectedContextType(contextType as any);
		setChatSelectorOpen(true);
		setChatSidebarOpen(false);
	};

	useEffect(() => {
		if (!user) return;

		const fetchUnreadCount = async () => {
			try {
				const chats = await chatApi.getChats();
				const total = Array.isArray(chats)
					? chats.reduce((sum: number, chat: any) => {
							const unreadCount = chat.unreadCount?.[user.id] || 0;
							return sum + unreadCount;
						}, 0)
					: 0;
				setTotalUnreadCount(total);
			} catch (error) {
				console.error('Error fetching unread count:', error);
			}
		};

		fetchUnreadCount();
		const interval = setInterval(fetchUnreadCount, 30000);
		return () => clearInterval(interval);
	}, [user]);

	return (
		<ChatProvider>
			<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
				<Header totalUnreadCount={totalUnreadCount} />

				{/* Main Content */}
				<Box
					component="main"
					sx={{
						flexGrow: 1,
						py: { xs: 3, sm: 4, md: 5 },
						px: { xs: 2, sm: 3, md: 4 },
						maxWidth: '100%',
						overflowX: 'hidden',
						minHeight: 'calc(100vh - 64px)',
					}}
				>
					<Container maxWidth="xl">{children}</Container>
				</Box>

				{/* Chat Components */}
				<ChatFab onClick={() => setChatSidebarOpen(true)} unreadCount={totalUnreadCount} />
				<ChatSidebar open={chatSidebarOpen} onClose={() => setChatSidebarOpen(false)} onChatSelect={handleChatSelect} onNewChat={handleNewChat} />
				<ChatContextSelector
					open={chatSelectorOpen}
					onClose={() => setChatSelectorOpen(false)}
					contextType={selectedContextType}
					onCreateChat={(contextType: string, contextId: string, participants: any[], metadata: any) => {
						// Chat will be created by the selector, just close the dialog
						setChatSelectorOpen(false);
					}}
				/>
				{openChats.map((chat) => (
					<ChatWindowModern
						key={chat.chatId}
						chatId={chat.chatId}
						contextType={chat.contextType}
						onClose={() => setOpenChats(openChats.filter((c) => c.chatId !== chat.chatId))}
					/>
				))}
			</Box>
		</ChatProvider>
	);
}
