
PumpFunSDK类里的getBuyInstructions，改了这个地方的逻辑
        try {
            //await (0, spl_token_1.getAccount)(this.connection, associatedUser, commitment);
            transaction.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(buyer, associatedUser, buyer, mint));
        }
        catch (e) {
            transaction.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(buyer, associatedUser, buyer, mint));
        }

可以确保最多成功购买一次mint，防止重复购买

appendonlydir 需要给当前用户赋予读写权限  chown -R currentuser:currentuser appendonlydir
