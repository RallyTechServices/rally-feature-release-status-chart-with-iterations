Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    _features: {}, /* key will be objectid */
    _async_flags: {}, /* key is object id of release work item looking up the tree */
    _feature_map: {}, /* key will be objectid */
    
    logger: new Rally.technicalservices.logger(),
    items: [
        {xtype:'container',itemId:'selector_box',margin: 5, layout:{type:'hbox'}},
        {xtype:'container',itemId:'chart_box' },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSummary();
    },
    _addSummary: function() {
        var selector_box = this.down('#selector_box');
        selector_box.add({
            xtype:'rallyreleasecombobox',
            itemId:'releasebox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getStoriesInRelease();
                },
                ready: function(rb) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getStoriesInRelease();
                }
            }
        });
    },
    _getStoriesInRelease: function() {
        var me = this;
        this.logger.log(this,"_getStoriesInRelease");
        if ( this.down('#selector_box').getEl() ) {
            this.down('#selector_box').getEl().mask("Finding Stories in Release...");
        }
        // clear out trackers
        this._features = {};
        this._async_flags = {};
        this._feature_map = {};
        
        var release = this.down('#releasebox').getRecord();
        var release_name = release.get('Name');
        
        var fetch = ['PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'Release.Name',value:release_name}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            limit:'Infinity',
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,stories){
                    me.logger.log(this,"    ...got stories in release",stories.length);
                    if ( this.down('#selector_box').getEl() ) {
                        this.down('#selector_box').getEl().mask("Finding Associated Features...");
                    }
                    Ext.Array.each(stories,function(story){  
                        if ( story.get('Parent') !== null ) {
                            me._async_flags[story.get('ObjectID')] = 1;
                            me._getTopLevelParent(story,story);
                        } else {
                            me._features[story.get('ObjectID')] = story;
                            me._addToFeature(story,story);
                        }
                    });
                    this._makeChart();
                }
            }
        });
    },
    _addToFeature: function(feature,item){
        this._feature_map[item.get('ObjectID')] = feature.get('ObjectID');
        
        var feature_total = feature.get('total_planned') || 0;
        var feature_count = feature.get('child_count') || 0;
        
        var plan_estimate = item.get('PlanEstimate') || 0;
        
        feature.set('total_planned',feature_total + plan_estimate);
        feature.set('child_count',feature_count + 1);
    },
    // keep track of calls as we spray a bunch of async calls looking for the most top level parent
    _getTopLevelParent: function(story,original_child) {
        this.logger.log(this,"_getTopLevelParent");
        var me = this;
        var fetch = ['PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'ObjectID',value:story.get('Parent').ObjectID}];
        
        // check first to see if this is in the map (so we don't bother the network)
        if ( me._feature_map[story.get('Parent').ObjectID] ) {
            me.logger.log(this,"Pulling from hash (parent) instead of querying");
            var feature = me._features[me._feature_map[story.get('Parent').ObjectID]];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else if (me._feature_map[story.get('ObjectID')] ) {
            me.logger.log(this,"Pulling from hash (story) instead of querying");
            var feature = me._features[me._feature_map[story.get('ObjectID')]];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else if (me._features[story.get('Parent').ObjectID]) {
            me.logger.log(this,"Already know parent feature (instead of querying)");
            var feature = me._features[story.get('Parent').ObjectID];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else {
            
            Ext.create('Rally.data.WsapiDataStore',{
                model:'UserStory',
                autoLoad: true,
                filters: filters,
                fetch: fetch,
                listeners: {
                    scope: this,
                    load: function(store,parents){
                        Ext.Array.each(parents,function(parent){
                            if ( parent.get('Parent') !== null ) {
                                if ( story.get('ObjectID') !== original_child.get('ObjectID') ) {
                                    delete me._async_flags[story.get('ObjectID')];
                                }
                                
                                if ( me._features[parent.get('Parent').ObjectID] ) {
                                    // put into map hash for easy pulling later
                                    me.logger.log(me,"My Parent is already known");
                                    me._feature_map[parent.get('ObjectID')] = me._features[parent.get('Parent').ObjectID].get('ObjectID');
                                    me._feature_map[story.get('ObjectID')]  = me._features[parent.get('Parent').ObjectID].get('ObjectID');
                                    me._addToFeature(me._features[parent.get('Parent').ObjectID],original_child);
                                    delete me._async_flags[original_child.get('ObjectID')];
                                    me._makeChart();
                                } else {
                                    me._getTopLevelParent(parent,original_child);
                                }
                            } else {
                                // we're at the top
                                if ( !me._features[parent.get('ObjectID')] ) {
                                    me._features[parent.get('ObjectID')] = parent;
                                }
                                // put into map hash for easy pulling later
                                me._feature_map[story.get('ObjectID')] = parent.get('ObjectID');
                                me._addToFeature(me._features[parent.get('ObjectID')], original_child);
                                delete me._async_flags[original_child.get('ObjectID')];
                                me._makeChart();
                            }
                        });
                    }
                }
            });
        }
    },
    _sortFeatures: function(a,b) {
        var name_a = "";
        var name_b = "";
        
        if ( a && a.get('Name') ) {
            name_a = a.get('Name');
        }
        
        if ( b && b.get('Name') ) {
            name_b = b.get('Name');
        }
        return name_a.localeCompare(name_b);
    },
    _getChartData: function() {
        var me = this;
        this.logger.log(this,"_getChartData");
        var chart_data = [];
        
        var features = [];
        Ext.Object.each(me._features, function(feature_oid,feature){
            features.push(feature);
        });
       
        this.logger.log(this,"sorting features...");
        features.sort(me._sortFeatures);
        this.logger.log(this,"...done", features.length, "features");
        
        var data = [];
        var names = [];
        
        Ext.Array.each(features, function(feature){
            me.logger.log(me,feature.get('Name'), feature.get('child_count'));
            names.push(feature.get('Name'));
            data.push(feature.get('total_planned'));
        });

        var series = [
            {
                type: 'column',
                data: data,
                visible: true,
                name: 'Total Planned US Points'
            }
        ];
        return { series: series, categories: names };
    },
    _makeChart: function() {
        this.logger.log(this,"_makeChart");
        this.down('#chart_box').removeAll();
        
        var keys = Ext.Object.getKeys(this._async_flags);
        if ( keys.length > 0 ) {
            this.logger.log(this,"Waiting for ", keys.length, " searches to complete");
        } else {
            var chart_data = this._getChartData();
            this.down('#selector_box').getEl().unmask();
            
            if ( chart_data.categories.length === 0 ) {
                this.down('#chart_box').add({xtype:'container',padding: 10, html:'No Features found for selection.'});
            } else {
                this.down('#chart_box').add({
                    xtype:'rallychart',
                    chartData: {
                        categories: chart_data.categories,
                        series: chart_data.series
                    },
                    chartConfig: {
                        chart: { height: 600 },
                        title: { text: 'Feature Status', align: 'center' },
                        yAxis: [{
                            title: {
                                enabled: true,
                                text: 'Story Points',
                                style: { fontWeight: 'normal' }
                            }
                        }],
                        xAxis: [{
                            title: {
                                enabled: true,
                                text: 'Features'
                            },
                            categories: chart_data.categories,
                            labels: {
                                rotation: 90,
                                align: 'left'
                            }
                        }]
                    }
                });
            }
        }
    }
});